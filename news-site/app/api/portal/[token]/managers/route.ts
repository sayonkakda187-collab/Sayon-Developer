import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { managerForPortalToken } from "@/lib/managerPortal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Portal mirror of the managers list (for the network dashboard's manager chips).
 *  Read-only; authorized by the path token. */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const mgr = await managerForPortalToken(params.token);
  if (!mgr) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const managers = await prisma.pageManager.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, photo: true, _count: { select: { pages: true } } },
  });
  return NextResponse.json({ ok: true, managers: managers.map((m) => ({ id: m.id, name: m.name, photo: m.photo, pageCount: m._count.pages })) });
}
