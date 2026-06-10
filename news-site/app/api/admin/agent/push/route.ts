import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isPushConfigured, getPublicKey, sendTestPush } from "@/lib/agent/push";
import { addPushSub, removePushSub } from "@/lib/agent/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Status + the public VAPID key the browser needs for PushManager.subscribe.
export async function GET() {
  await requireAdmin();
  return NextResponse.json({ configured: isPushConfigured(), publicKey: getPublicKey() });
}

// Subscribe this device, unsubscribe it, or this is harmless if push is off.
export async function POST(req: Request) {
  await requireAdmin();
  if (!isPushConfigured()) {
    return NextResponse.json({ ok: false, error: "Push isn’t configured — set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY." }, { status: 503 });
  }

  let body: { subscription?: unknown; unsubscribe?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  if (typeof body.unsubscribe === "string" && body.unsubscribe) {
    await removePushSub(body.unsubscribe);
    return NextResponse.json({ ok: true });
  }

  const sub = body.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ ok: false, error: "Invalid subscription." }, { status: 400 });
  }
  await addPushSub({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
  // Send a confirmation push so the owner sees it works immediately.
  const sent = await sendTestPush();
  return NextResponse.json({ ok: true, sent });
}
