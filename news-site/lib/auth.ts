import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

const SESSION_COOKIE = "admin_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (value && value.length > 0) return value;
  // Never sign sessions with a hardcoded secret in production.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET is required in production. Set it to a long random value (e.g. `openssl rand -hex 32`).",
    );
  }
  return "dev-insecure-secret-change-me";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Stateless signed token: base64url(payload).hmac(payload)
function createToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, iat: Date.now() }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function readToken(token: string | undefined): { uid: string } | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { uid?: unknown; iat?: unknown };
    if (typeof data.uid !== "string") return null;
    if (typeof data.iat === "number" && Date.now() - data.iat > MAX_AGE * 1000) {
      return null;
    }
    return { uid: data.uid };
  } catch {
    return null;
  }
}

export function setSessionCookie(userId: string) {
  cookies().set(SESSION_COOKIE, createToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearSessionCookie() {
  cookies().delete(SESSION_COOKIE);
}

export async function getSessionUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const parsed = readToken(token);
  if (!parsed) return null;
  return prisma.user.findUnique({
    where: { id: parsed.uid },
    select: { id: true, email: true, role: true },
  });
}

/** For Server Components / layouts: redirects to login when not authenticated. */
export async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  return user;
}

/** Verify credentials; returns the user id on success, otherwise null. */
export async function authenticate(
  email: string,
  password: string,
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return user.id;
}
