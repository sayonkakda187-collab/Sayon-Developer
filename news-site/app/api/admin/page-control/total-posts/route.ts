import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMonitoredTotalPosts } from "@/lib/pageControlTotals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET `?page={monitoredPageId}&refresh=1` — one MONITORED page's all-time post
 * count for the Summary "Total posts" gauge. Lazy (only the opened page) + cached
 * ~24h on the row. `capped` = the count is a floor (shown as "N+"). A scope-less /
 * invalid token comes back as `status: "reconnect"`.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const pageDbId = searchParams.get("page");
  if (!pageDbId) return NextResponse.json({ ok: false, error: "Missing page id" }, { status: 400 });
  const refresh = searchParams.get("refresh") === "1";

  const page = await prisma.monitoredPage.findUnique({
    where: { id: pageDbId },
    select: { id: true, pageId: true, accessToken: true, totalPosts: true, totalPostsCapped: true, totalPostsAt: true },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Page not found" }, { status: 404 });

  const { count, capped, status } = await getMonitoredTotalPosts(page, refresh);
  return NextResponse.json({ ok: true, count, capped, status });
}
