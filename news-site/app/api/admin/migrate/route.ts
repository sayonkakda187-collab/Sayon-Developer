import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { MIGRATIONS } from "@/lib/generated/migrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Apply the bundled Prisma migrations from the running site.
 *
 * `prisma migrate deploy` runs during the Vercel build, and when it fails the
 * only record is inside a build log — which is exactly the thing that is hard to
 * reach when a site is down. This route applies the same SQL and reports the
 * result as JSON, so a failure says what happened instead of disappearing.
 *
 * Safety:
 *   - gated on BOOTSTRAP_SECRET, compared in constant time; a miss returns 404
 *   - each migration runs inside a TRANSACTION, so a failure leaves no partial
 *     schema behind
 *   - migrations already recorded in _prisma_migrations are skipped, making the
 *     route idempotent and safe to retry
 *   - the same checksums Prisma uses are recorded, so a later `migrate deploy`
 *     treats these as applied rather than trying to run them again
 *
 * This does not replace the build step; it is the fallback for when it fails.
 */
function secretOk(given: string | null): boolean {
  const expected = process.env.BOOTSTRAP_SECRET ?? "";
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Prisma's own bookkeeping table, created exactly as the CLI creates it. */
const MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id"                    VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum"              VARCHAR(64) NOT NULL,
  "finished_at"           TIMESTAMPTZ,
  "migration_name"        VARCHAR(255) NOT NULL,
  "logs"                  TEXT,
  "rolled_back_at"        TIMESTAMPTZ,
  "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count"   INTEGER NOT NULL DEFAULT 0
)`;

export async function POST(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  if (!secretOk(url.searchParams.get("secret"))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    await prisma.$executeRawUnsafe(MIGRATIONS_TABLE);

    const done = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
    );
    const already = new Set(done.map((r) => r.migration_name));

    for (const m of MIGRATIONS) {
      if (already.has(m.name)) {
        skipped.push(m.name);
        continue;
      }
      // One transaction per migration: a failure rolls back cleanly rather than
      // leaving half a schema for the next attempt to trip over.
      await prisma.$transaction(
        async (tx) => {
          for (const statement of m.statements) {
            await tx.$executeRawUnsafe(statement);
          }
          await tx.$executeRawUnsafe(
            `INSERT INTO "_prisma_migrations"
               (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
             VALUES ($1, $2, $3, now(), now(), $4)`,
            crypto.randomUUID(),
            m.checksum,
            m.name,
            m.statements.length,
          );
        },
        // Prisma's default interactive-transaction timeout is 5s. The initial
        // migration is 22 statements, and each one is a separate round trip —
        // trivial against localhost, but against a pooled connection several
        // regions away it is close enough to 5s to fail intermittently. That is
        // precisely the kind of fault that only appears in production, where
        // the log is hardest to read, so give it real headroom.
        { maxWait: 15_000, timeout: 50_000 },
      );
      applied.push(m.name);
    }

    const tables = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*)::bigint AS count FROM information_schema.tables WHERE table_schema = 'public'`,
    );

    return NextResponse.json({
      ok: true,
      applied: applied.length,
      skipped: skipped.length,
      tables: Number(tables[0]?.count ?? 0),
      appliedNames: applied,
      next: "/api/admin/bootstrap?secret=…",
    });
  } catch (e) {
    // Name the migration that failed — "migrations failed" on its own is the
    // unhelpful message this route exists to replace.
    return NextResponse.json(
      {
        ok: false,
        appliedBeforeFailure: applied,
        failedOn: MIGRATIONS.find((m) => !applied.includes(m.name) && !skipped.includes(m.name))?.name ?? null,
        error: e instanceof Error ? e.message.slice(0, 600) : String(e).slice(0, 600),
      },
      { status: 500 },
    );
  }
}

/** Report what would run, without changing anything. */
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  if (!secretOk(url.searchParams.get("secret"))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  try {
    const tables = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*)::bigint AS count FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    return NextResponse.json({
      database: "reachable",
      tables: Number(tables[0]?.count ?? 0),
      bundledMigrations: MIGRATIONS.length,
      hint: "POST to this same URL to apply them.",
    });
  } catch (e) {
    return NextResponse.json(
      { database: "unreachable", error: e instanceof Error ? e.message.slice(0, 300) : String(e) },
      { status: 503 },
    );
  }
}
