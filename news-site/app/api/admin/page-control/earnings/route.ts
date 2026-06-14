import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Web entry for daily page earnings (the same `PageEarning` rows the Telegram bot
 * writes). LOCAL app data — no Graph. Admin-only.
 *
 * GET `?date=YYYY-MM-DD` → every page's saved earning for that Phnom-Penh day.
 * POST `{ monitoredPageId, date, amount }` → upsert (overwrites that page+day);
 *   `amount` null/"" clears it. `enteredByManagerId` is set to the page's assigned
 *   manager (null when unassigned).
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const date = new URL(req.url).searchParams.get("date");
  if (!date || !DATE_RE.test(date)) return NextResponse.json({ ok: false, error: "Bad date" }, { status: 400 });

  const rows = await prisma.pageEarning.findMany({ where: { date }, select: { monitoredPageId: true, amount: true, currency: true } });
  return NextResponse.json({ ok: true, earnings: rows.map((r) => ({ monitoredPageId: r.monitoredPageId, amount: Number(r.amount), currency: r.currency })) });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

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

  const page = await prisma.monitoredPage.findUnique({ where: { id: monitoredPageId }, select: { id: true, managerId: true } });
  if (!page) return NextResponse.json({ ok: false, error: "Page not found" }, { status: 404 });

  // Clear (empty) → delete the day's row.
  if (amount === null || amount === undefined || amount === "") {
    await prisma.pageEarning.deleteMany({ where: { monitoredPageId, date } });
    return NextResponse.json({ ok: true, amount: null });
  }

  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) return NextResponse.json({ ok: false, error: "Enter a number ≥ 0." }, { status: 400 });
  const rounded = Math.round(n * 100) / 100;

  await prisma.pageEarning.upsert({
    where: { monitoredPageId_date: { monitoredPageId, date } },
    create: { monitoredPageId, date, amount: rounded, currency: "USD", enteredByManagerId: page.managerId },
    update: { amount: rounded, enteredByManagerId: page.managerId },
  });
  return NextResponse.json({ ok: true, amount: rounded });
}
