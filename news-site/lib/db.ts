import { PrismaClient } from "@prisma/client";

/**
 * Make sure DATABASE_URL actually holds a Postgres connection string before the
 * Prisma client reads it.
 *
 * Vercel's marketplace integrations create the connection string under a
 * namespaced name — SUPABASE_POSTGRES_PRISMA_URL, POSTGRES_PRISMA_URL,
 * DATABASE_URL_UNPOOLED and so on — and leave DATABASE_URL for you to set by
 * hand. Copying a value out of that dashboard is easy to get wrong: the copy
 * control sits beside the NAME, and integration variables are stored as secrets
 * so the value often cannot be revealed at all. Getting it wrong produces a
 * connection error that looks identical to having no database.
 *
 * So when DATABASE_URL is missing or is not a Postgres URL, fall back to any
 * environment variable that holds one, preferring a pooled/Prisma-shaped URL
 * since that is what the query engine should use.
 *
 * This never overrides a DATABASE_URL that is already valid.
 */
function looksLikePostgresUrl(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (!/^postgres(ql)?:\/\//.test(v)) return false;
  try {
    return Boolean(new URL(v).hostname);
  } catch {
    return false;
  }
}

function resolveDatabaseUrl(): string | undefined {
  if (looksLikePostgresUrl(process.env.DATABASE_URL)) return process.env.DATABASE_URL;

  // Most specific first: a Prisma-shaped pooled URL is the best fit for the
  // query engine, then a plain pooled URL, then anything else that parses.
  const bySuffix = (suffix: string) =>
    Object.entries(process.env)
      .filter(([name]) => name.endsWith(suffix))
      .map(([, value]) => value)
      .find(looksLikePostgresUrl);

  const found =
    bySuffix("POSTGRES_PRISMA_URL") ??
    bySuffix("POSTGRES_URL") ??
    bySuffix("DATABASE_URL") ??
    bySuffix("POSTGRES_URL_NON_POOLING") ??
    bySuffix("DATABASE_URL_UNPOOLED");

  if (found) {
    // Say so once, loudly. Silently running on a different connection string
    // than the one configured would be a nasty thing to debug later.
    console.warn(
      "[db] DATABASE_URL was missing or not a Postgres URL; using a connection " +
        "string found elsewhere in the environment. Set DATABASE_URL properly to " +
        "silence this.",
    );
  }
  return found;
}

const resolved = resolveDatabaseUrl();
if (resolved && resolved !== process.env.DATABASE_URL) {
  process.env.DATABASE_URL = resolved;
}

// Reuse a single PrismaClient across hot reloads in development so we don't
// exhaust the database connection pool. In production a single instance is
// created per server process.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
