import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FacebookApiError } from "@/lib/facebook";
import { getMonitoredPagePostsForView } from "@/lib/pageControlPosts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET — one MONITORED page's REAL published posts (Page Control → Content).
 *   `?page={monitoredPageId}` (required) · `?after={cursor}` · `?refresh=1`.
 * Independent from the farm — looks up MonitoredPage, uses its own token + cache.
 * Token/permission failures → `{ ok:true, status:"reconnect", posts:[] }`.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const pageDbId = searchParams.get("page");
  if (!pageDbId) return NextResponse.json({ ok: false, error: "Missing page id" }, { status: 400 });
  const after = searchParams.get("after") || undefined;
  const refresh = searchParams.get("refresh") === "1";

  const page = await prisma.monitoredPage.findUnique({
    where: { id: pageDbId },
    select: { id: true, pageId: true, accessToken: true },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Page not found" }, { status: 404 });

  try {
    const { posts, after: nextAfter } = await getMonitoredPagePostsForView(page, { after, refresh });
    return NextResponse.json({ ok: true, status: "ok", posts, after: nextAfter });
  } catch (e) {
    if (e instanceof FacebookApiError && !e.expired && !e.permission) {
      return NextResponse.json({ ok: false, error: e.message });
    }
    return NextResponse.json({ ok: true, status: "reconnect", posts: [], after: null });
  }
}
