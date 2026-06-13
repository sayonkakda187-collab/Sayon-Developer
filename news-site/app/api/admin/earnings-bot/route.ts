import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { earningsBotConfigured, getEarningsWebhookInfo, setEarningsWebhook } from "@/lib/earningsBot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The public webhook URL for THIS deployment (from the forwarded host). */
function webhookUrl(req: Request): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}/api/earnings-bot`;
}

/** GET — earnings-bot status (token configured? current Telegram webhook info). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!earningsBotConfigured()) return NextResponse.json({ ok: true, configured: false });
  const info = await getEarningsWebhookInfo();
  return NextResponse.json({ ok: true, configured: true, info });
}

/** POST — register THIS deployment's URL as the bot's webhook (admin convenience so
 *  you don't have to call the Telegram API by hand). Uses the server-side token. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!earningsBotConfigured()) {
    return NextResponse.json({ ok: false, configured: false, error: "EARNINGS_TELEGRAM_BOT_TOKEN is not set." });
  }
  const url = webhookUrl(req);
  const secret = process.env.EARNINGS_TELEGRAM_WEBHOOK_SECRET || null;
  const res = await setEarningsWebhook(url, secret);
  return NextResponse.json({ ok: res.ok, url, secretConfigured: !!secret, description: res.description });
}
