import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMonitoredTotalPosts } from "@/lib/pageControlTotals";
import { requirePortalManager, NO_STORE } from "@/lib/portalAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Portal mirror of a monitored page's all-time post count (Summary "Total posts" gauge).
 *  READ-ONLY; authorized + rate-limited by the path token. */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const auth = await requirePortalManager(req, params.token);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const pageDbId = searchParams.get("page");
  if (!pageDbId) return NextResponse.json({ ok: false, error: "Missing page id" }, { status: 400, headers: NO_STORE });
  const refresh = searchParams.get("refresh") === "1";

  const page = await prisma.monitoredPage.findUnique({
    where: { id: pageDbId },
    select: { id: true, pageId: true, accessToken: true, totalPosts: true, totalPostsCapped: true, totalPostsAt: true },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Page not found" }, { status: 404, headers: NO_STORE });

  const { count, capped, status } = await getMonitoredTotalPosts(page, refresh);
  return NextResponse.json({ ok: true, count, capped, status }, { headers: NO_STORE });
}
