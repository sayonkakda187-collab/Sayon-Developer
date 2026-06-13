import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — the Page Control managers for the header's "Search by manager" autocomplete:
 * every `PageManager` (id · name · photo) with its page count (from the `managerId`
 * links). LOCAL app data only — no Graph calls. Admin-only.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const managers = await prisma.pageManager.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, photo: true, _count: { select: { pages: true } } },
  });

  return NextResponse.json({
    ok: true,
    managers: managers.map((m) => ({ id: m.id, name: m.name, photo: m.photo, pageCount: m._count.pages })),
  });
}
