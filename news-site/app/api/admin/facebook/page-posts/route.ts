import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FacebookApiError } from "@/lib/facebook";
import { getPagePostsForView } from "@/lib/facebookPosts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET — one Page's REAL published posts (Page Control → Content).
 *   `?page={pageDbId}` (required) · `?after={cursor}` (load more) · `?refresh=1`.
 * Lazy: only the requested Page is fetched (never the whole list). Token /
 * permission failures come back as `{ ok:true, status:"reconnect", posts:[] }`
 * so the UI shows the same "Needs reconnect" badge pattern as Insights; transient
 * errors (rate limit / network) come back as `{ ok:false, error }`.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const pageDbId = searchParams.get("page");
  if (!pageDbId) return NextResponse.json({ ok: false, error: "Missing page id" }, { status: 400 });
  const after = searchParams.get("after") || undefined;
  const refresh = searchParams.get("refresh") === "1";

  const page = await prisma.facebookPage.findUnique({
    where: { id: pageDbId },
    select: { id: true, pageId: true, accessToken: true },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Page not found" }, { status: 404 });

  try {
    const { posts, after: nextAfter } = await getPagePostsForView(page, { after, refresh });
    return NextResponse.json({ ok: true, status: "ok", posts, after: nextAfter });
  } catch (e) {
    if (e instanceof FacebookApiError && !e.expired && !e.permission) {
      // Transient (rate limit / network) — surface the friendly message, keep posts empty.
      return NextResponse.json({ ok: false, error: e.message });
    }
    // Token invalid / missing scope / corrupt token → reconnect state.
    return NextResponse.json({ ok: true, status: "reconnect", posts: [], after: null });
  }
}
