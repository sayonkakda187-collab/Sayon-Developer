import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v21.0";

// Admin-only avatar proxy. Resolves a connected Page's REAL profile picture using
// its (encrypted, server-side) access token, then 302-redirects to the Facebook
// CDN image. Unauthenticated graph.facebook.com/{id}/picture requests now return
// a silhouette/placeholder for most Pages — which is exactly why the browser
// couldn't load them directly. The token never reaches the browser. A 404 here
// makes the client fall back to a tidy coloured initial.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  await requireAdmin();

  const raw = Number(new URL(req.url).searchParams.get("size"));
  const size = Number.isFinite(raw) ? Math.min(320, Math.max(24, Math.round(raw))) : 96;

  const page = await prisma.facebookPage.findUnique({
    where: { id: params.id },
    select: { pageId: true, accessToken: true },
  });
  if (!page) return new NextResponse(null, { status: 404 });

  let token: string;
  try {
    token = decryptSecret(page.accessToken);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(page.pageId)}/picture` +
    `?type=square&width=${size}&height=${size}&redirect=false&access_token=${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return new NextResponse(null, { status: 404 });
    const data = (await res.json()) as { data?: { url?: string; is_silhouette?: boolean } };
    const picUrl = data.data?.url;
    if (!picUrl || data.data?.is_silhouette) {
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
