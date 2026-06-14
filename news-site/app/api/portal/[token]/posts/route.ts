import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { FacebookApiError } from "@/lib/facebook";
import { getMonitoredPagePostsForView } from "@/lib/pageControlPosts";
import { requirePortalManager, NO_STORE } from "@/lib/portalAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Portal mirror of a monitored page's REAL published posts (Content / Summary tabs).
 *  READ-ONLY; authorized + rate-limited by the path token. Any monitored page is
 *  viewable (consistent with the portal's read-only all-results access). */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const auth = await requirePortalManager(req, params.token);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const pageDbId = searchParams.get("page");
  if (!pageDbId) return NextResponse.json({ ok: false, error: "Missing page id" }, { status: 400, headers: NO_STORE });
  const after = searchParams.get("after") || undefined;
  const refresh = searchParams.get("refresh") === "1";

  const page = await prisma.monitoredPage.findUnique({ where: { id: pageDbId }, select: { id: true, pageId: true, accessToken: true } });
  if (!page) return NextResponse.json({ ok: false, error: "Page not found" }, { status: 404, headers: NO_STORE });

  try {
    const { posts, after: nextAfter } = await getMonitoredPagePostsForView(page, { after, refresh });
    return NextResponse.json({ ok: true, status: "ok", posts, after: nextAfter }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof FacebookApiError && !e.expired && !e.permission) {
      return NextResponse.json({ ok: false, error: e.message }, { headers: NO_STORE });
    }
    return NextResponse.json({ ok: true, status: "reconnect", posts: [], after: null }, { headers: NO_STORE });
  }
}
