import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { fetchPagePicture } from "@/lib/facebook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Admin-only avatar proxy / resolver. Resolves a connected Page's REAL profile
// picture using its (encrypted, server-side) access token, PERSISTS the resolved
// CDN URL on the record (so the next render uses the stored fast-path with no
// Graph call), then 302-redirects to the Facebook CDN image. The token never
// reaches the browser. A 404 here makes the client fall back to a tidy coloured
// initial. This is the self-healing path the shared avatar uses when there's no
// stored URL yet or a stored URL has expired.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  await requireAdmin();

  const raw = Number(new URL(req.url).searchParams.get("size"));
  const size = Number.isFinite(raw) ? Math.min(320, Math.max(24, Math.round(raw))) : 96;

  const page = await prisma.facebookPage.findUnique({
    where: { id: params.id },
    select: { id: true, pageId: true, accessToken: true },
  });
  if (!page) return new NextResponse(null, { status: 404 });

  let token: string;
  try {
    token = decryptSecret(page.accessToken);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const pic = await fetchPagePicture(page.pageId, token, size);
    const picUrl = pic.isSilhouette ? null : pic.url;
    // Record what we resolved (incl. null for a silhouette) so bulk refresh skips
    // it for the TTL and future renders use the stored URL.
    await prisma.facebookPage
      .update({ where: { id: page.id }, data: { avatarUrl: picUrl, avatarFetchedAt: new Date() } })
      .catch(() => {});
    if (!picUrl) {
      // No real picture set on the Page → show initials instead of FB's grey
      // silhouette. Briefly cached so it isn't re-resolved on every render.
      return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=600" } });
    }
    const redirect = NextResponse.redirect(picUrl, 302);
    redirect.headers.set("Cache-Control", "private, max-age=1800");
    return redirect;
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
