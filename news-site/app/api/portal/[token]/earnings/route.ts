import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { managerForPortalToken } from "@/lib/managerPortal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Portal earnings — scoped to the token's manager's OWN pages.
 *  GET `?date=` → that manager's pages' earnings for the day.
 *  POST `{ monitoredPageId, date, amount }` → upsert/clear, REJECTED unless the page is
 *  assigned to this manager. */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const mgr = await managerForPortalToken(params.token);
  if (!mgr) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const date = new URL(req.url).searchParams.get("date");
  if (!date || !DATE_RE.test(date)) return NextResponse.json({ ok: false, error: "Bad date" }, { status: 400 });

  const pageIds = (await prisma.monitoredPage.findMany({ where: { managerId: mgr.id }, select: { id: true } })).map((p) => p.id);
  const rows = await prisma.pageEarning.findMany({ where: { monitoredPageId: { in: pageIds }, date }, select: { monitoredPageId: true, amount: true, currency: true } });
  return NextResponse.json({ ok: true, earnings: rows.map((r) => ({ monitoredPageId: r.monitoredPageId, amount: Number(r.amount), currency: r.currency })) });
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const mgr = await managerForPortalToken(params.token);
  if (!mgr) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
  const { monitoredPageId, date, amount } = (body ?? {}) as { monitoredPageId?: unknown; date?: unknown; amount?: unknown };
  if (typeof monitoredPageId !== "string" || typeof date !== "string" || !DATE_RE.test(date)) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  // Hard ownership check — the page MUST belong to this manager.
  const page = await prisma.monitoredPage.findFirst({ where: { id: monitoredPageId, managerId: mgr.id }, select: { id: true } });
  if (!page) return NextResponse.json({ ok: false, error: "That page isn’t assigned to you." }, { status: 403 });

  if (amount === null || amount === undefined || amount === "") {
    await prisma.pageEarning.deleteMany({ where: { monitoredPageId, date } });
    return NextResponse.json({ ok: true, amount: null });
  }
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) return NextResponse.json({ ok: false, error: "Enter a number ≥ 0." }, { status: 400 });
  const rounded = Math.round(n * 100) / 100;
  await prisma.pageEarning.upsert({
    where: { monitoredPageId_date: { monitoredPageId, date } },
    create: { monitoredPageId, date, amount: rounded, currency: "USD", enteredByManagerId: mgr.id },
    update: { amount: rounded, enteredByManagerId: mgr.id },
  });
  return NextResponse.json({ ok: true, amount: rounded });
}
