import { PrismaClient } from "@prisma/client";
import { prisma } from "./db";

/**
 * Copy content out of a second PostgreSQL database into this one.
 *
 * The old database was paused after its free monthly allowance ran out, taking
 * every published article with it. A new database was created to get the site
 * back, so the articles have to move across once the old one is reachable again.
 *
 * Design notes, all of them about not losing data:
 *
 *   - Primary keys are COPIED, not regenerated. They are cuids, so they stay
 *     unique, and preserving them keeps every foreign key and the article↔tag
 *     join intact without a translation table.
 *   - Every insert is ON CONFLICT DO NOTHING with no conflict target, so ANY
 *     unique violation — id, slug, email — skips that row instead of aborting
 *     the batch. That makes the whole import idempotent and safe to re-run,
 *     which matters because it will not finish in one request.
 *   - Columns are INTERSECTED between the two databases at runtime. The old
 *     database may sit at a different migration than this one; copying only the
 *     columns both sides have means a schema difference drops a field rather
 *     than failing the import.
 *   - Tables are copied parents-first so foreign keys always resolve.
 */

/** Copied in FK order: a table never precedes something it references. */
const GROUPS = {
  /**
   * The articles themselves and everything needed to render them.
   *
   * The article↔tag join table is NOT listed: Prisma names an implicit
   * many-to-many table after the RELATION, so `@relation("ArticleTags")` makes
   * it `_ArticleTags`, not the `_ArticleToTag` the default naming would suggest.
   * Guessing that name copied zero rows and every article arrived untagged —
   * silently, because a table that does not exist looks the same as one that is
   * empty. They are discovered from the source instead; see joinTables().
   */
  content: ["Site", "Category", "Tag", "Article", "Comment", "Newsletter"],
  /** Read history behind the Audience dashboard and the views counters. */
  analytics: ["DailyView", "ArticleCountryView", "ArticleDeviceView", "RecentView"],
  /**
   * Connected accounts. Their tokens are encrypted with ENCRYPTION_KEY — if that
   * variable changed when the database did, the rows copy fine but decrypt to
   * nothing and each page has to be reconnected. Off by default for that reason.
   */
  integrations: [
    "AppSetting",
    "FacebookPage",
    "ScheduledPost",
    "PageManager",
    "MonitoredPage",
    "PageEarning",
  ],
} as const;

export type ImportGroup = keyof typeof GROUPS;

export type TableResult = { table: string; copied: number; skipped: number; done: boolean };
export type ImportResult = {
  ok: boolean;
  tables: TableResult[];
  done: boolean;
  error?: string;
};

/** Quote an identifier for interpolation into raw SQL. */
function q(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Prisma's implicit many-to-many join tables, read from the source rather than
 * assumed. They are the tables whose names start with an underscore, minus
 * Prisma's own migration bookkeeping.
 */
async function joinTables(client: PrismaClient): Promise<string[]> {
  const rows = await client.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename LIKE '\\_%'
        AND tablename <> '_prisma_migrations'
      ORDER BY tablename`,
  );
  return rows.map((r) => r.tablename);
}

async function columnsOf(client: PrismaClient, table: string): Promise<string[]> {
  const rows = await client.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    table,
  );
  return rows.map((r) => r.column_name);
}

/**
 * Copy one table, resuming where a previous run stopped.
 *
 * Ordered by the table's own primary key and paged with OFFSET so a run that
 * runs out of time can be continued by calling again — rows already present are
 * skipped by ON CONFLICT, so overlap is harmless.
 */
async function copyTable(
  source: PrismaClient,
  table: string,
  batch: number,
  deadline: number,
): Promise<TableResult> {
  const [srcCols, dstCols] = await Promise.all([
    columnsOf(source, table),
    columnsOf(prisma, table),
  ]);
  const cols = srcCols.filter((c) => dstCols.includes(c));
  if (cols.length === 0) {
    // The table does not exist on one side (an older or newer schema). Nothing
    // to do — and saying so beats failing the whole import over one table.
    return { table, copied: 0, skipped: 0, done: true };
  }

  const list = cols.map(q).join(", ");
  const order = cols.includes("id") ? q("id") : list;
  let copied = 0;
  let skipped = 0;
  let offset = 0;

  for (;;) {
    if (Date.now() > deadline) return { table, copied, skipped, done: false };

    const rows = await source.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT ${list} FROM ${q(table)} ORDER BY ${order} LIMIT ${batch} OFFSET ${offset}`,
    );
    if (rows.length === 0) return { table, copied, skipped, done: true };

    for (const row of rows) {
      const values = cols.map((c) => row[c]);
      const params = cols.map((_, i) => `$${i + 1}`).join(", ");
      // Count what was actually INSERTED, not what was attempted. ON CONFLICT
      // DO NOTHING returns 0 for a row that already existed, and reporting the
      // attempt instead would tell the operator "copied 6" on a re-run that
      // moved nothing — the one moment the number has to be trustworthy.
      const affected = await prisma.$executeRawUnsafe(
        `INSERT INTO ${q(table)} (${list}) VALUES (${params}) ON CONFLICT DO NOTHING`,
        ...values,
      );
      if (affected > 0) copied++;
      else skipped++;
    }
    offset += rows.length;
    if (rows.length < batch) return { table, copied, skipped, done: true };
  }
}

/**
 * Run the import. Returns `done: false` when it ran out of time — call again to
 * continue; already-copied rows are skipped, so repeated calls converge.
 */
export async function importFromDatabase(opts: {
  sourceUrl: string;
  groups: ImportGroup[];
  /** Stop this many ms from now and report progress rather than being killed. */
  budgetMs: number;
  batch?: number;
}): Promise<ImportResult> {
  const { sourceUrl, groups, budgetMs, batch = 200 } = opts;
  const deadline = Date.now() + budgetMs;

  const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
  const results: TableResult[] = [];
  try {
    await source.$connect();
    // Join tables reference both Article and Tag, so they follow the content
    // tables and precede nothing that depends on them.
    const joins = groups.includes("content") ? await joinTables(source) : [];
    for (const g of groups) {
      const tables = g === "content" ? [...GROUPS[g], ...joins] : [...GROUPS[g]];
      for (const table of tables) {
        const r = await copyTable(source, table, batch, deadline);
        results.push(r);
        if (!r.done) return { ok: true, tables: results, done: false };
      }
    }
    return { ok: true, tables: results, done: true };
  } catch (e) {
    return {
      ok: false,
      tables: results,
      done: false,
      error: e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500),
    };
  } finally {
    await source.$disconnect().catch(() => {});
  }
}

/**
 * Row counts on both sides, so what is there is visible before anything moves.
 *
 * Counts are `number | null`, where null means the query FAILED — a table that
 * is not there, or a connection that is not working. An earlier version
 * collapsed both into `-1`, which told the operator a number instead of a
 * reason and hid every table that was empty on both sides. When nothing
 * expected is found, this reports the database name and the tables that DO
 * exist, which answers "am I even pointed at the right database?" directly.
 */
export async function compareDatabases(sourceUrl: string): Promise<{
  ok: boolean;
  rows: { table: string; source: number | null; target: number | null }[];
  database?: string;
  foundNothing?: boolean;
  sourceTables?: string[];
  otherDatabases?: string[];
  error?: string;
}> {
  const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
  try {
    await source.$connect();

    // Which database did we actually land in? A connection string pointing at
    // the wrong database succeeds and then finds nothing, which looks identical
    // to an empty one until you can see the name.
    const who = await source.$queryRawUnsafe<{ db: string }[]>(
      `SELECT current_database() AS db`,
    );
    const database = who[0]?.db ?? "?";

    const tables = [
      ...GROUPS.content,
      ...(await joinTables(source)),
      ...GROUPS.analytics,
      ...GROUPS.integrations,
    ];
    const rows: { table: string; source: number | null; target: number | null }[] = [];
    let firstError: string | null = null;
    for (const table of tables) {
      const count = async (c: PrismaClient) => {
        try {
          const r = await c.$queryRawUnsafe<{ n: bigint }[]>(
            `SELECT count(*)::bigint AS n FROM ${q(table)}`,
          );
          return Number(r[0]?.n ?? 0);
        } catch (e) {
          if (!firstError && e instanceof Error) firstError = e.message.slice(0, 200);
          return null;
        }
      };
      const [s, t] = await Promise.all([count(source), count(prisma)]);
      // Show every table, including ones empty on both sides. Hiding them is
      // what made a broken connection look like a one-line result.
      rows.push({ table, source: s, target: t });
    }

    const anyOnSource = rows.some((r) => (r.source ?? 0) > 0);
    if (!anyOnSource) {
      // Nothing expected was found. List what IS in there — the fastest way to
      // tell "wrong database" from "right database, genuinely empty".
      const actual = await source
        .$queryRawUnsafe<{ tablename: string }[]>(
          `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename LIMIT 40`,
        )
        .catch(() => [] as { tablename: string }[]);
      // One more thing worth ruling out before sending someone back to the
      // dashboard: the right server, the wrong database ON it. Neon's connection
      // dialog lets you pick the database as well as the branch, so landing in
      // an empty `neondb` while the content sits in another one is easy to do
      // and impossible to see from the connection string.
      const others = await source
        .$queryRawUnsafe<{ datname: string }[]>(
          `SELECT datname FROM pg_database
            WHERE datistemplate = false AND datname <> current_database()
            ORDER BY datname LIMIT 20`,
        )
        .catch(() => [] as { datname: string }[]);

      return {
        ok: true,
        rows,
        database,
        foundNothing: true,
        sourceTables: actual.map((r) => r.tablename),
        otherDatabases: others.map((r) => r.datname),
        error: firstError ?? undefined,
      };
    }
    return { ok: true, rows, database };
  } catch (e) {
    return {
      ok: false,
      rows: [],
      error: e instanceof Error ? e.message.slice(0, 400) : String(e).slice(0, 400),
    };
  } finally {
    await source.$disconnect().catch(() => {});
  }
}
