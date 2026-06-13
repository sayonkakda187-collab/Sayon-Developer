import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { FacebookApiError } from "@/lib/facebook";
import { getPageDaily, type DayPoint } from "@/lib/facebookInsights";
import { rangeToUnix, previousPeriod, ppToday, addDays } from "@/lib/fbInsightsRange";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_RANGE_DAYS = 92;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseRange(from: string | null, to: string | null): { from: string; to: string } {
  const today = ppToday();
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) return { from: addDays(today, -27), to: today };
  let f = from <= to ? from : to;
  const t = from <= to ? to : from;
  const span = Math.round((Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / 86400000) + 1;
  if (span > MAX_RANGE_DAYS) f = addDays(t, -(MAX_RANGE_DAYS - 1));
  return { from: f, to: t };
}

/**
 * GET `?detail={monitoredPageId}&from=&to=` — one MONITORED page's day-by-day
 * insights for the range + previous period, in the same `DetailData` shape the
 * Page Control Summary/Analytics components consume. Page Control is watch-only,
 * so `shares` / `prevPostsTotal` / `posts` (our-system shares) are always empty —
 * the real content lives in the Content tab. Independent token + no farm data.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const pageDbId = searchParams.get("detail");
  if (!pageDbId) return NextResponse.json({ ok: false, error: "Missing page id" }, { status: 400 });

  const range = parseRange(searchParams.get("from"), searchParams.get("to"));
  const prev = previousPeriod(range.from, range.to);

  const page = await prisma.monitoredPage.findUnique({
    where: { id: pageDbId },
    select: { id: true, pageId: true, pageName: true, accessToken: true },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Page not found" }, { status: 404 });

  const empty = { shares: {} as Record<string, number>, prevPostsTotal: 0, posts: [] as never[] };

  let token: string;
  try {
    token = decryptSecret(page.accessToken);
  } catch {
    return NextResponse.json({
      ok: true,
      detail: { pageDbId: page.id, pageName: page.pageName, from: range.from, to: range.to, status: "reconnect", days: [], daysPrev: [], ...empty },
    });
  }

  const { since, until } = rangeToUnix(prev.from, range.to);
  try {
    const res = await getPageDaily(page.pageId, token, since, until);
    const days: DayPoint[] = [];
    const daysPrev: DayPoint[] = [];
    for (const dp of res.days) {
      if (dp.date >= range.from && dp.date <= range.to) days.push(dp);
      else if (dp.date >= prev.from && dp.date <= prev.to) daysPrev.push(dp);
    }
    return NextResponse.json({
      ok: true,
      detail: { pageDbId: page.id, pageName: page.pageName, from: range.from, to: range.to, status: "ok", days, daysPrev, ...empty },
    });
  } catch (e) {
    const reconnect = e instanceof FacebookApiError && (e.expired || e.permission);
    return NextResponse.json({
      ok: true,
      detail: { pageDbId: page.id, pageName: page.pageName, from: range.from, to: range.to, status: reconnect ? "reconnect" : "ok", days: [], daysPrev: [], ...empty },
    });
  }
}
