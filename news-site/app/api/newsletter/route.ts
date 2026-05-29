import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = String((body as { email?: unknown })?.email ?? "")
    .trim()
    .toLowerCase();

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  // Dedupe on the unique email column.
  const existing = await prisma.newsletter.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ message: "You're already subscribed." });
  }

  await prisma.newsletter.create({ data: { email } });
  return NextResponse.json({ message: "Thanks for subscribing!" });
}
