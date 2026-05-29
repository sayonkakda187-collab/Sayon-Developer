import { NextResponse } from "next/server";
import { authenticate, setSessionCookie } from "@/lib/auth";

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

  const userId = await authenticate(email, password);
  if (!userId) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  setSessionCookie(userId);
  return NextResponse.json({ ok: true });
}
