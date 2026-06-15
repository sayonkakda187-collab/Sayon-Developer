import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePortalManager, NO_STORE } from "@/lib/portalAuth";
import { parsePastedEarnings } from "@/lib/pageEarningsImport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT = 20_000; // ~hundreds of lines; the parser also caps rows at MAX_EARNINGS_BATCH

/**
 * Manager Portal — BULK "paste daily earnings" for ONE of the manager's OWN pages.
 * POST `{ monitoredPageId, text, commit }`:
 *   • preview (commit falsy) → parse the pasted text → { rows, unparsed } (writes NOTHING)
 *   • commit true → upsert each parsed (date, amount) for that page (overwrite per day)
 * Authorized + rate-limited by the path token (token → manager). The selected page is
 * RE-VERIFIED to belong to this manager on EVERY call (403 otherwise) — exactly like the
 * single-day edit guard — so the client's page choice is never trusted. Parsing is done
 * server-side both times, so the client can't inject arbitrary amounts. no-store.
 */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const auth = await requirePortalManager(req, params.token);
  if (auth instanceof NextResponse) return auth;
  const mgr = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400, headers: NO_STORE });
  }
  const { monitoredPageId, text, commit } = (body ?? {}) as { monitoredPageId?: unknown; text?: unknown; commit?: unknown };
  if (typeof monitoredPageId !== "string" || typeof text !== "string") {
    return NextResponse.json({ ok: false, error: "Pick a page and paste your earnings." }, { status: 400, headers: NO_STORE });
  }
  if (text.length > MAX_TEXT) {
    return NextResponse.json({ ok: false, error: "That’s a lot of text — paste up to ~200 days at a time." }, { status: 413, headers: NO_STORE });
  }

  // Hard ownership check — the page MUST belong to this manager (server-enforced; the
  // client's choice is never trusted, the same guard as the single-day earnings edit).
  const page = await prisma.monitoredPage.findFirst({ where: { id: monitoredPageId, managerId: mgr.id }, select: { id: true, pageName: true } });
  if (!page) return NextResponse.json({ ok: false, error: "That page isn’t assigned to you." }, { status: 403, headers: NO_STORE });

  const { rows, unparsed, truncated } = parsePastedEarnings(text);

  if (!commit) {
    return NextResponse.json({ ok: true, preview: true, pageName: page.pageName, rows, unparsed, truncated }, { headers: NO_STORE });
  }

  // Commit: upsert one row per (page, date). Amounts/dates were already validated +
  // bounded by the parser; one bad row never aborts the rest.
  let saved = 0;
  for (const r of rows) {
    try {
      await prisma.pageEarning.upsert({
        where: { monitoredPageId_date: { monitoredPageId: page.id, date: r.date } },
        create: { monitoredPageId: page.id, date: r.date, amount: r.amount, currency: "USD", enteredByManagerId: mgr.id },
        update: { amount: r.amount, enteredByManagerId: mgr.id },
      });
      saved += 1;
    } catch {
      /* skip a bad row, keep going */
    }
  }
  return NextResponse.json({ ok: true, saved, pageName: page.pageName, rows, unparsed, truncated }, { headers: NO_STORE });
}
