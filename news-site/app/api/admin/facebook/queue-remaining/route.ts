import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { queuePendingShares } from "@/lib/facebookQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hand the remaining (not-yet-posted) pages of a live share job to the server
 * queue so the Vercel Cron runner finishes them — used by the share flow's
 * `ShareJobCard` when the tab is closed mid-share (`navigator.sendBeacon`) or the
 * "Finish on server" button (`fetch`). Admin-only; the session cookie rides along
 * with both. The client only ever sends pages the live loop hasn't started, so
 * no page is posted twice.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const { articleId, caption, pageDbIds } = (body ?? {}) as {
    articleId?: unknown;
    caption?: unknown;
    pageDbIds?: unknown;
  };
  if (typeof articleId !== "string" || !Array.isArray(pageDbIds)) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
  const ids = pageDbIds.filter((x): x is string => typeof x === "string");

  try {
    const count = await queuePendingShares(articleId, typeof caption === "string" ? caption : null, ids);
    return NextResponse.json({ ok: true, count });
  } catch {
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
