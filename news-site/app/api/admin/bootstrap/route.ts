import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ONE-TIME admin bootstrap for a fresh database.
 *
 * `prisma db seed` can't do this job here: it uses create() rather than upsert()
 * so it cannot be re-run, it requires a terminal, and it also inserts six sample
 * articles — fine for local dev, wrong for a live news site. This creates the
 * admin account and nothing else, from the browser.
 *
 * Three independent locks, all of which must pass:
 *   1. BOOTSTRAP_SECRET must be set in the environment and matched exactly
 *      (compared in constant time, so the value can't be probed byte by byte).
 *   2. The User table must be EMPTY. Once any user exists this returns 410 and
 *      can never create another — so it cannot be used to add a second admin or
 *      to overwrite the real one later.
 *   3. ADMIN_EMAIL and ADMIN_PASSWORD must both be present.
 *
 * After a successful run, delete BOOTSTRAP_SECRET from the environment. Lock 2
 * already makes the route inert, but there is no reason to leave the key lying
 * around.
 */
function secretOk(given: string | null): boolean {
  const expected = process.env.BOOTSTRAP_SECRET ?? "";
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so compare lengths first.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  if (!secretOk(url.searchParams.get("secret"))) {
    // Deliberately vague: never reveal whether the secret is unset or wrong.
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let existing: number;
  try {
    existing = await prisma.user.count();
  } catch {
    return NextResponse.json(
      { error: "Couldn’t reach the database. Check DATABASE_URL and DIRECT_URL." },
      { status: 503 },
    );
  }
  if (existing > 0) {
    return NextResponse.json(
      { error: "Already set up — an account exists. This route is now closed." },
      { status: 410 },
    );
  }

  // Credentials come from the request body, falling back to the environment.
  // Body-first means only ONE variable (BOOTSTRAP_SECRET) has to be added to
  // the host to get an account created — fewer dashboard steps, fewer mistakes.
  // It is no less safe: the request is HTTPS, and it still has to pass the
  // secret check above and the empty-table check below.
  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown;
    password?: unknown;
  };
  const email = (typeof body.email === "string" ? body.email : process.env.ADMIN_EMAIL ?? "")
    .trim()
    .toLowerCase();
  const password =
    typeof body.password === "string" ? body.password : process.env.ADMIN_PASSWORD ?? "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Provide email and password in the request body, or set ADMIN_EMAIL and ADMIN_PASSWORD." },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "That does not look like an email address." }, { status: 400 });
  }

  await prisma.user.create({
    data: { email, passwordHash: hashPassword(password), role: "admin" },
  });
  return NextResponse.json({ ok: true, email, next: "/admin/login" });
}

/** GET reports readiness without changing anything, so the setup can be checked
 *  before it is run. Same secret gate. */
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  if (!secretOk(url.searchParams.get("secret"))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  try {
    const users = await prisma.user.count();
    return NextResponse.json({
      database: "reachable",
      connection: describeConnection(),
      users,
      // Credentials may be supplied in the POST body, so their absence from the
      // environment does not block anything — only an existing account does.
      adminEnvVarsSet: Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD),
      canBootstrap: users === 0,
    });
  } catch (e) {
    // Report enough to identify the fault WITHOUT ever echoing the credentials:
    // whether the variable exists, which host it names, and Prisma's error code.
    // "unreachable" alone cannot distinguish a missing variable from a typo in
    // the hostname from a database that is genuinely down.
    const code = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : null;
    return NextResponse.json(
      {
        database: "unreachable",
        connection: describeConnection(),
        errorCode: code,
        meaning: explain(code),
      },
      { status: 503 },
    );
  }
}

/** Describe DATABASE_URL without leaking it: presence, scheme, host, db name.
 *  Never the user or password. */
function describeConnection(): Record<string, unknown> {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    return { databaseUrlSet: false, note: "DATABASE_URL is not set in this environment." };
  }
  try {
    const u = new URL(raw);
    return {
      databaseUrlSet: true,
      scheme: u.protocol.replace(":", ""),
      host: u.hostname,
      database: u.pathname.replace(/^\//, "") || null,
      pooled: u.hostname.includes("-pooler") || u.searchParams.has("pgbouncer"),
    };
  } catch {
    return { databaseUrlSet: true, note: "DATABASE_URL is set but is not a valid URL." };
  }
}

/** Plain-language meaning for the Prisma error codes seen at connection time. */
function explain(code: string | null): string {
  switch (code) {
    case "P1001":
      return "Reached the network but the database server did not answer — wrong host, or the database is paused/stopped.";
    case "P1000":
      return "Host answered but rejected the credentials — the user or password in DATABASE_URL is wrong.";
    case "P1003":
      return "Connected, but that database name does not exist on the server.";
    case "P1017":
      return "The server closed the connection — often a pooler limit or a sleeping instance.";
    case "P2021":
      return "Connected, but the tables do not exist — migrations have not run yet.";
    default:
      return code
        ? "Unrecognised Prisma error code; the code above is the thing to search for."
        : "No Prisma error code — most often DATABASE_URL is missing or malformed.";
  }
}
