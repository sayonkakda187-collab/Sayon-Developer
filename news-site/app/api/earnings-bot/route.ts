import { NextResponse } from "next/server";
import { handleEarningsUpdate } from "@/lib/earningsBot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Telegram webhook for the EARNINGS bot. Telegram POSTs each update here. We verify
 * its secret header (set with the webhook), dispatch the update, and always return 200
 * so Telegram doesn't retry. No auth cookie — this is called by Telegram, not a user.
 */
export async function POST(req: Request) {
  const secret = process.env.EARNINGS_TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let update: unknown;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  await handleEarningsUpdate(update);
  return NextResponse.json({ ok: true });
}
