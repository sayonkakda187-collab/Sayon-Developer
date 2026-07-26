import { NextResponse } from "next/server";
import { AuthConfigError, authenticate, setSessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = String((body as { email?: unknown })?.email ?? "");
  const password = String((body as { password?: unknown })?.password ?? "");

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  // Credential check and session creation are reported separately: a crash here
  // used to return an empty 500, which the login page could only render as a
  // generic "Login failed." — indistinguishable from a wrong password. Now a
  // server/config problem says so explicitly, so it's fixable at a glance.
  let userId: string | null;
  try {
    userId = await authenticate(email, password);
  } catch (e) {
    console.error("Login: authenticate failed:", e);
    return NextResponse.json(
      { error: "Couldn’t reach the database. Please try again in a moment." },
      { status: 503 },
    );
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  try {
    setSessionCookie(userId);
  } catch (e) {
    console.error("Login: could not create session:", e);
    const detail =
      e instanceof AuthConfigError
        ? "the server is missing its session secret (set AUTH_SECRET or ENCRYPTION_KEY in your hosting environment, then redeploy)"
        : "the session could not be created";
    return NextResponse.json(
      { error: `Your password was correct, but ${detail}.` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
