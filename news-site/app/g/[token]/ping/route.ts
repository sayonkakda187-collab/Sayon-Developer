import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { userAgent } from "next/server";
import { getGallery } from "@/lib/galleries";
import { recordPresence, sampleGallerySeries } from "@/lib/galleryPresence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public heartbeat for gallery live-presence. An open /g/<token> page POSTs here
 * every ~15s with a random per-session visitorId. Only records presence for a
 * REAL, enabled gallery, and stores just an anonymous count + coarse country
 * (Vercel geo header) + device class — no IP, no PII.
 */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const gallery = await getGallery(params.token);
  if (!gallery || !gallery.enabled) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  let visitorId = "";
  try {
    const body = (await req.json()) as { visitorId?: unknown };
    if (typeof body?.visitorId === "string") visitorId = body.visitorId;
  } catch {
    /* no body */
  }
  visitorId = visitorId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  if (!visitorId) return NextResponse.json({ ok: false }, { status: 400 });

  const h = headers();
  const country = h.get("x-vercel-ip-country") || "ZZ";
  const t = userAgent({ headers: h }).device.type;
  const device = t === "mobile" || t === "tablet" ? t : "desktop";

  await recordPresence(params.token, visitorId, country, device);
  // Fold this heartbeat into the gallery's live reader graph (throttled internally;
  // best-effort so a sampling hiccup never fails the heartbeat).
  await sampleGallerySeries(params.token).catch(() => {});
  return NextResponse.json({ ok: true });
}
