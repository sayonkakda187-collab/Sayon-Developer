import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePortalManager, NO_STORE } from "@/lib/portalAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Portal mirror of the managers list (for the network dashboard's manager chips).
 *  Read-only; authorized + rate-limited by the path token. */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const auth = await requirePortalManager(req, params.token);
  if (auth instanceof NextResponse) return auth;

  const managers = await prisma.pageManager.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, photo: true, _count: { select: { pages: true } } },
  });
  return NextResponse.json(
    { ok: true, managers: managers.map((m) => ({ id: m.id, name: m.name, photo: m.photo, pageCount: m._count.pages })) },
    { headers: NO_STORE },
  );
}
