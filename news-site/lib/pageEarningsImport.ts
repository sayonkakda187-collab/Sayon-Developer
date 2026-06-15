import "server-only";
import { prisma } from "@/lib/db";
import { ppToday } from "@/lib/fbInsightsRange";

// ── Shared logic for the AI Assistant's `set_page_earnings` tool ─────────────
// The assistant parses natural-language / pasted earnings into structured entries
// { pageName, date, amount }. This module then (1) normalizes each date + amount,
// (2) fuzzily matches each pageName to a MonitoredPage, (3) builds an APPROVAL
// PREVIEW (flagging overwrites / unmatched / ambiguous / invalid rows), and — only
// after the admin approves — (4) upserts the writable rows. It ONLY reads/writes
// PageEarning and reads page/manager names; it never touches any other Page Control
// data and makes no Facebook/Graph calls.

/** A single earnings entry as proposed by the assistant. `amount`/`date` are accepted
 *  loosely (string or number) and normalized here, so the tool is robust to the model
 *  passing "$2.10" / "Jun 1" rather than the canonical forms. */
export type EarningEntryInput = { pageName?: unknown; date?: unknown; amount?: unknown };

export const MAX_EARNINGS_BATCH = 200;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/** True if y-m-d is a real calendar date. */
function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Normalize a loose date string to a Phnom-Penh `YYYY-MM-DD`, or null if unparseable.
 * Handles: ISO `2026-06-01`, `6/1` / `06/01/2026`, `Jun 1` / `June 1 2026`, and a bare
 * day `1` (→ the current PP month/year). When only month+day are given, the year is the
 * current PP year. Two-digit years map to 2000+.
 */
export function normalizeEarningDate(input: unknown, today: string = ppToday()): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim().replace(/(\d)(st|nd|rd|th)\b/gi, "$1").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const [cy, cm] = today.split("-").map((n) => parseInt(n, 10));

  // ISO YYYY-MM-DD
  if (ISO_RE.test(s)) {
    const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
    return isRealDate(y, m, d) ? s : null;
  }
  // Numeric M/D or M/D/Y (also accept '-' / '.' separators)
  const num = /^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?$/.exec(s);
  if (num) {
    const m = parseInt(num[1], 10);
    const d = parseInt(num[2], 10);
    let y = num[3] ? parseInt(num[3], 10) : cy;
    if (num[3] && num[3].length === 2) y += 2000;
    return isRealDate(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
  }
  // Month-name forms: "Jun 1", "June 1 2026", or "1 Jun"
  const lower = s.toLowerCase();
  let mn = /^([a-z]+)\s+(\d{1,2})(?:\s+(\d{2,4}))?$/.exec(lower);
  let monthTok: string | undefined, dayTok: string | undefined, yearTok: string | undefined;
  if (mn) {
    [, monthTok, dayTok, yearTok] = mn;
  } else {
    mn = /^(\d{1,2})\s+([a-z]+)(?:\s+(\d{2,4}))?$/.exec(lower);
    if (mn) [, dayTok, monthTok, yearTok] = mn;
  }
  if (mn && monthTok && dayTok) {
    const m = MONTHS[monthTok];
    if (!m) return null;
    const d = parseInt(dayTok, 10);
    let y = yearTok ? parseInt(yearTok, 10) : cy;
    if (yearTok && yearTok.length === 2) y += 2000;
    return isRealDate(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
  }
  // Bare day → current PP month/year
  if (/^\d{1,2}$/.test(s)) {
    const d = parseInt(s, 10);
    return isRealDate(cy, cm, d) ? `${cy}-${pad(cm)}-${pad(d)}` : null;
  }
  return null;
}

/** Parse a loose amount ("$2.10", "1,234.5", 2.1) → a non-negative number ≤2dp, or null. */
export function normalizeEarningAmount(input: unknown): number | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0 || input > 1_000_000_000) return null;
    return Math.round(input * 100) / 100;
  }
  if (typeof input !== "string") return null;
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) return null;
  return Math.round(n * 100) / 100;
}

// ── Pasted-list parsing (Manager Portal "paste daily earnings") ───────────────
// Turn a free-text blob of "date amount" pairs (one per line OR a comma/semicolon
// inline list, e.g. "Jun 1: $14.91, Jun 2: $12.30") into (date, amount) rows for a
// SINGLE already-chosen page — no page-name matching here. Reuses the same date +
// amount normalizers as the admin tool, so behaviour matches. Dates resolve in
// Phnom-Penh; the year defaults to the current PP year when omitted.

const MONTH_NAME = String.raw`[A-Za-z]{3,9}\.?`;
// A date token in any of the forms normalizeEarningDate accepts.
const DATE_TOKEN = [
  String.raw`${MONTH_NAME}\s+\d{1,2}(?:\s*,?\s*\d{2,4})?`, // Jun 1 · June 1, 2026
  String.raw`\d{1,2}\s+${MONTH_NAME}(?:\s*,?\s*\d{2,4})?`, // 1 Jun
  String.raw`\d{4}-\d{1,2}-\d{1,2}`, // 2026-06-01
  String.raw`\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?`, // 6/1 · 06/01/2026
].join("|");
// $ + number (optional thousands commas / 2dp). The trailing (?!\d) stops a day
// being mis-eaten as part of the amount.
const AMOUNT_TOKEN = String.raw`\$?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?`;
const ENTRY_SOURCE = String.raw`(${DATE_TOKEN})\s*[:=\-–—]?\s*(${AMOUNT_TOKEN})(?!\d)`;

export type ParsedEarningRow = { date: string; amount: number };
export type PastedEarnings = { rows: ParsedEarningRow[]; unparsed: string[]; truncated: boolean };

/**
 * Parse pasted daily earnings into normalized (date, amount) rows for ONE page.
 * Tolerant of line-by-line and inline comma/semicolon lists; de-dupes by date
 * (last value wins). Lines with text but no readable (date, amount) pair are
 * returned in `unparsed` so the UI can flag them. Never throws.
 */
export function parsePastedEarnings(text: unknown, today: string = ppToday()): PastedEarnings {
  const src = typeof text === "string" ? text : "";
  const re = new RegExp(ENTRY_SOURCE, "gi");
  const byDate = new Map<string, number>();
  const lines = src.split(/\r?\n/);
  const matchedLine = new Set<number>();

  lines.forEach((line, i) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      if (m.index === re.lastIndex) re.lastIndex++; // guard against a zero-width match
      const date = normalizeEarningDate(m[1], today);
      const amount = normalizeEarningAmount(m[2]);
      if (date && amount != null) {
        byDate.set(date, amount); // last wins (a repeated day overwrites)
        matchedLine.add(i);
      }
    }
  });

  const unparsed = lines
    .map((l, i) => ({ l: l.trim(), i }))
    .filter((x) => x.l.length > 0 && !matchedLine.has(x.i))
    .map((x) => (x.l.length > 120 ? `${x.l.slice(0, 117)}…` : x.l))
    .slice(0, 50);

  let rows = [...byDate.entries()].map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date));
  const truncated = rows.length > MAX_EARNINGS_BATCH;
  if (truncated) rows = rows.slice(0, MAX_EARNINGS_BATCH);
  return { rows, unparsed, truncated };
}

// ── Page-name matching (case-insensitive, fuzzy/closest) ─────────────────────

export type PageRef = { id: string; pageName: string; managerId: string | null };

/** Lowercase + strip punctuation/emoji + collapse whitespace, for tolerant matching. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Dice coefficient over character bigrams (0..1) — cheap, dependency-free fuzzy score. */
function diceScore(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const ma = bigrams(a);
  const mb = bigrams(b);
  let overlap = 0;
  for (const [g, ca] of ma) {
    const cb = mb.get(g);
    if (cb) overlap += Math.min(ca, cb);
  }
  const total = a.length - 1 + (b.length - 1);
  return (2 * overlap) / total;
}

export type PageMatch =
  | { kind: "ok"; id: string; pageName: string; managerId: string | null }
  | { kind: "ambiguous"; candidates: { id: string; pageName: string }[] }
  | { kind: "none" };

const FUZZY_THRESHOLD = 0.62; // best score must clear this to auto-match
const FUZZY_MARGIN = 0.08; // …and beat the runner-up by at least this much

/**
 * Match a (possibly messy) page name to one MonitoredPage. Tiers: exact-normalized →
 * unique substring containment → best fuzzy (Dice) above a threshold AND clearly ahead
 * of the runner-up. Ties / weak matches return "ambiguous" (with candidates) or "none"
 * — never a silent guess.
 */
export function matchPageName(name: string, pages: PageRef[]): PageMatch {
  const q = norm(name);
  if (!q) return { kind: "none" };

  // 1) Exact normalized match.
  const exact = pages.filter((p) => norm(p.pageName) === q);
  if (exact.length === 1) return { kind: "ok", id: exact[0].id, pageName: exact[0].pageName, managerId: exact[0].managerId };
  if (exact.length > 1) return { kind: "ambiguous", candidates: exact.map((p) => ({ id: p.id, pageName: p.pageName })) };

  // 2) Substring containment (either direction), if it picks out exactly one.
  const contains = pages.filter((p) => {
    const n = norm(p.pageName);
    return n.includes(q) || q.includes(n);
  });
  if (contains.length === 1) return { kind: "ok", id: contains[0].id, pageName: contains[0].pageName, managerId: contains[0].managerId };
  if (contains.length > 1) return { kind: "ambiguous", candidates: contains.map((p) => ({ id: p.id, pageName: p.pageName })) };

  // 3) Fuzzy: best Dice score, must clear the threshold and beat the runner-up.
  const scored = pages
    .map((p) => ({ p, s: diceScore(q, norm(p.pageName)) }))
    .sort((a, b) => b.s - a.s);
  if (scored.length === 0) return { kind: "none" };
  const best = scored[0];
  const runner = scored[1];
  if (best.s >= FUZZY_THRESHOLD && (!runner || best.s - runner.s >= FUZZY_MARGIN)) {
    return { kind: "ok", id: best.p.id, pageName: best.p.pageName, managerId: best.p.managerId };
  }
  // Close-but-tied fuzzy candidates → ask the admin to pick (cap the list).
  const near = scored.filter((x) => x.s >= FUZZY_THRESHOLD - 0.12).slice(0, 5);
  if (near.length >= 1) return { kind: "ambiguous", candidates: near.map((x) => ({ id: x.p.id, pageName: x.p.pageName })) };
  return { kind: "none" };
}

// ── Preview building ─────────────────────────────────────────────────────────

export type ResolvedStatus = "save" | "overwrite" | "unmatched" | "ambiguous" | "invalid";

export type ResolvedRow = {
  status: ResolvedStatus;
  inputPageName: string;
  inputDate: string;
  inputAmount: string;
  // Present when matched + valid:
  monitoredPageId?: string;
  pageName?: string;
  date?: string;
  amount?: number;
  previousAmount?: number | null; // existing saved value (overwrite flag)
  managerId?: string | null;
  // Present when unmatched/ambiguous/invalid:
  candidates?: { id: string; pageName: string }[];
  reason?: string;
};

export type EarningsPreview = {
  rows: ResolvedRow[];
  counts: { save: number; overwrite: number; unmatched: number; ambiguous: number; invalid: number; total: number };
  truncated: boolean; // input exceeded MAX_EARNINGS_BATCH and was capped
};

function asText(v: unknown): string {
  if (v == null) return "";
  return typeof v === "string" ? v : String(v);
}

/**
 * Resolve the assistant's proposed entries into a preview: match each page, normalize
 * date+amount, and flag overwrites of existing values. Reads MonitoredPage names +
 * existing PageEarning values; writes nothing.
 */
export async function buildEarningsPreview(entries: EarningEntryInput[]): Promise<EarningsPreview> {
  const today = ppToday();
  const list = Array.isArray(entries) ? entries.slice(0, MAX_EARNINGS_BATCH) : [];
  const truncated = Array.isArray(entries) && entries.length > MAX_EARNINGS_BATCH;

  const pages: PageRef[] = (
    await prisma.monitoredPage.findMany({ select: { id: true, pageName: true, managerId: true } })
  ).map((p) => ({ id: p.id, pageName: p.pageName, managerId: p.managerId }));

  // Pre-resolve matches + normalized values so we can batch the "existing value" lookup.
  type Pre = { row: ResolvedRow; key?: string };
  const pre: Pre[] = list.map((e) => {
    const inputPageName = asText(e.pageName).trim();
    const inputDate = asText(e.date).trim();
    const inputAmount = asText(e.amount).trim();
    const base: ResolvedRow = { status: "invalid", inputPageName, inputDate, inputAmount };

    if (!inputPageName) return { row: { ...base, reason: "Missing page name." } };
    const match = matchPageName(inputPageName, pages);
    if (match.kind === "none") return { row: { ...base, status: "unmatched", reason: "No monitored page matched this name." } };
    if (match.kind === "ambiguous") return { row: { ...base, status: "ambiguous", candidates: match.candidates, reason: "Several pages could match — please pick one." } };

    const date = normalizeEarningDate(inputDate, today);
    if (!date) return { row: { ...base, monitoredPageId: match.id, pageName: match.pageName, reason: `Couldn't read the date “${inputDate}”.` } };
    const amount = normalizeEarningAmount(e.amount);
    if (amount == null) return { row: { ...base, monitoredPageId: match.id, pageName: match.pageName, date, reason: `Couldn't read the amount “${inputAmount}” (need a number ≥ 0, ≤ 2 decimals).` } };

    const row: ResolvedRow = {
      status: "save",
      inputPageName,
      inputDate,
      inputAmount,
      monitoredPageId: match.id,
      pageName: match.pageName,
      date,
      amount,
      managerId: match.managerId,
    };
    return { row, key: `${match.id}|${date}` };
  });

  // Look up existing values for the matched (page,date) pairs → flag overwrites.
  const keys = pre.filter((p) => p.key).map((p) => p.key!) as string[];
  if (keys.length > 0) {
    const ids = Array.from(new Set(pre.filter((p) => p.row.monitoredPageId && p.key).map((p) => p.row.monitoredPageId!)));
    const dates = Array.from(new Set(pre.filter((p) => p.key).map((p) => p.row.date!)));
    const existing = await prisma.pageEarning.findMany({
      where: { monitoredPageId: { in: ids }, date: { in: dates } },
      select: { monitoredPageId: true, date: true, amount: true },
    });
    const existingByKey = new Map(existing.map((x) => [`${x.monitoredPageId}|${x.date}`, Number(x.amount)]));
    for (const p of pre) {
      if (!p.key) continue;
      const prev = existingByKey.get(p.key);
      if (prev != null) {
        p.row.previousAmount = prev;
        p.row.status = "overwrite";
      }
    }
  }

  const rows = pre.map((p) => p.row);
  const counts = {
    save: rows.filter((r) => r.status === "save").length,
    overwrite: rows.filter((r) => r.status === "overwrite").length,
    unmatched: rows.filter((r) => r.status === "unmatched").length,
    ambiguous: rows.filter((r) => r.status === "ambiguous").length,
    invalid: rows.filter((r) => r.status === "invalid").length,
    total: rows.length,
  };
  return { rows, counts, truncated };
}

/** Only the rows that will actually be written (matched + valid). */
export function writableRows(rows: ResolvedRow[]): ResolvedRow[] {
  return rows.filter((r) => (r.status === "save" || r.status === "overwrite") && r.monitoredPageId && r.date && r.amount != null);
}

/** The compact row persisted on the pending approval action (and re-applied on approve). */
export type StoredEarningRow = { monitoredPageId: string; pageName: string; date: string; amount: number; previousAmount: number | null };

/** Map preview rows → the compact rows stored on the approval action. */
export function toStoredRows(rows: ResolvedRow[]): StoredEarningRow[] {
  return writableRows(rows).map((r) => ({
    monitoredPageId: r.monitoredPageId!,
    pageName: r.pageName ?? r.inputPageName,
    date: r.date!,
    amount: r.amount!,
    previousAmount: r.previousAmount ?? null,
  }));
}

export type ApplyResult = { saved: number; overwritten: number; skipped: number };

/**
 * Upsert the approved rows (one per page+date). `enteredByManagerId` is RE-RESOLVED at
 * write time to each page's CURRENT assigned manager (else null = admin-entered), and a
 * page that was removed between preview and approval is skipped — so what's written is
 * always consistent with the live data. Never partially throws.
 */
export async function applyStoredEarnings(rows: StoredEarningRow[]): Promise<ApplyResult> {
  const valid = (Array.isArray(rows) ? rows : []).filter(
    (r) => r && typeof r.monitoredPageId === "string" && typeof r.date === "string" && ISO_RE.test(r.date) && typeof r.amount === "number" && Number.isFinite(r.amount),
  );
  let saved = 0;
  let overwritten = 0;
  let skipped = 0;
  if (valid.length === 0) return { saved, overwritten, skipped };

  // Re-resolve each involved page's current manager (one query) — also confirms the page
  // still exists; rows for a removed page are skipped.
  const ids = Array.from(new Set(valid.map((r) => r.monitoredPageId)));
  const pages = await prisma.monitoredPage.findMany({ where: { id: { in: ids } }, select: { id: true, managerId: true } });
  const mgrByPage = new Map(pages.map((p) => [p.id, p.managerId]));

  for (const r of valid) {
    if (!mgrByPage.has(r.monitoredPageId)) {
      skipped += 1; // page removed since the preview
      continue;
    }
    const amount = Math.round(r.amount * 100) / 100;
    if (amount < 0 || amount > 1_000_000_000) {
      skipped += 1;
      continue;
    }
    const managerId = mgrByPage.get(r.monitoredPageId) ?? null;
    try {
      await prisma.pageEarning.upsert({
        where: { monitoredPageId_date: { monitoredPageId: r.monitoredPageId, date: r.date } },
        create: { monitoredPageId: r.monitoredPageId, date: r.date, amount, currency: "USD", enteredByManagerId: managerId },
        update: { amount, enteredByManagerId: managerId },
      });
      if (r.previousAmount != null) overwritten += 1;
      else saved += 1;
    } catch {
      skipped += 1;
    }
  }
  return { saved, overwritten, skipped };
}
