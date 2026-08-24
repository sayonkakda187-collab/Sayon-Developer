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

  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || !password) {
    return NextResponse.json(
      { error: "Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment first." },
      { status: 400 },
    );
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
      users,
      adminEmailSet: Boolean(process.env.ADMIN_EMAIL),
      adminPasswordSet: Boolean(process.env.ADMIN_PASSWORD),
      canBootstrap: users === 0 && Boolean(process.env.ADMIN_EMAIL) && Boolean(process.env.ADMIN_PASSWORD),
    });
  } catch {
    return NextResponse.json(
      { database: "unreachable", hint: "Check DATABASE_URL and DIRECT_URL." },
      { status: 503 },
    );
  }
}
