import "server-only";

import { prisma } from "@/lib/db";
import { getAgentSettings, addAction, type AgentSettings, type AutopilotRun } from "@/lib/agent/store";
import { aggregateTrending, isSourceConfigured } from "@/lib/news/aggregate";
import { NEWS_SOURCE_IDS } from "@/lib/news/sources";
import { titleTokens, jaccard, urlKey, type NormalizedItem } from "@/lib/news/normalize";
import { executeTool } from "@/lib/agent/tools";
import { isAiConfigured } from "@/lib/aiAssist";
import { sendAutopilotPush } from "@/lib/agent/push";
import { publishScheduledArticleById } from "@/lib/publish";
import { nextFreeSlots } from "@/lib/scheduleSlots";
import { toLocalInput } from "@/lib/fbSchedule";

type NewsSourceId = (typeof NEWS_SOURCE_IDS)[number];

// ── Auto-Pilot "Runs" ────────────────────────────────────────────────────────
// Each Run finds top trending stories across its categories (optional keyword
// focus), writes N ORIGINAL articles via the EXISTING agent draft tool (reuses the
// AI pipeline + source attribution + auto featured image), then either leaves them
// as DRAFTS for approval (default) or AUTO-PUBLISHES them (publish now, or stagger
// into the preferred posting slots). Everything it touches is reused, never
// duplicated. Safety rails: per-Run count cap, a global daily auto-publish cap, a
// pause-all kill switch, and an atomic once-per-day claim so a Run never runs twice.

const HARD_LIMIT_MS = 56_000; // never exceed the Hobby 60s ceiling (incl. finalize)
const DRAFT_TIMEOUT_MS = 16_000; // hard cap per draft
const FINALIZE_MS = 4_000; // headroom reserved for push + activity log
const MIN_RUN_MS = 22_000; // don't start a scheduled Run with less budget than this
const TITLE_SIM = 0.82;
const RECENT_TITLES = 400;

const PP_OFFSET_MIN = 7 * 60; // Asia/Phnom_Penh, fixed UTC+7

/** UTC "HH:MM" → Phnom-Penh "HH:MM" (fixed +7, no DST). */
function ppTimeOf(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (h * 60 + m + PP_OFFSET_MIN) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
/** "Auto-Pilot 12:00 run" — the scheduled-item source label (PP time). */
export function autopilotRunLabel(run: AutopilotRun): string {
  return `Auto-Pilot ${ppTimeOf(run.timeUtc)} run`;
}

export type AutopilotResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  created: number;
  titles: string[];
  errors: string[];
  message?: string;
};

type RunOutcome = {
  ok: boolean;
  created: number;
  published: number;
  scheduled: number;
  titles: string[];
  errors: string[];
  message?: string;
};

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

// ── Idempotency + daily cap (stored in the AppSetting key-value table) ─────────

/** Atomic once-per-occurrence claim: create a unique key; a duplicate (a second
 *  overlapping pinger call) throws and returns false, so the Run never runs twice. */
async function claimMark(key: string): Promise<boolean> {
  try {
    await prisma.appSetting.create({ data: { key, value: new Date().toISOString(), encrypted: false } });
    return true;
  } catch {
    return false;
  }
}

async function cleanupMarks(): Promise<void> {
  const cutoff = new Date(Date.now() - 4 * 86_400_000);
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: "autopilot_mark:" }, updatedAt: { lt: cutoff } } }).catch(() => {});
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: "autopilot_pub:" }, updatedAt: { lt: cutoff } } }).catch(() => {});
}

function ppDateNow(): string {
  return toLocalInput(new Date()).slice(0, 10);
}
async function readPubCount(date: string): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key: `autopilot_pub:${date}` } });
  const n = row ? Number(row.value) : 0;
  return Number.isFinite(n) ? n : 0;
}
async function bumpPubCount(date: string, by: number): Promise<void> {
  if (by <= 0) return;
  const key = `autopilot_pub:${date}`;
  const cur = await readPubCount(date);
  await prisma.appSetting
    .upsert({ where: { key }, update: { value: String(cur + by), encrypted: false }, create: { key, value: String(by), encrypted: false } })
    .catch(() => {});
}

/** The mark key for a Run's most-recent occurrence at/under `now` (or null when
 *  that occurrence is already too far in the past to bother firing late). */
function dueMarkKey(now: Date, run: AutopilotRun): string | null {
  const [h, m] = run.timeUtc.split(":").map(Number);
  const t = new Date(now);
  t.setUTCHours(h, m, 0, 0);
  let occ = t.getTime();
  if (occ > now.getTime()) occ -= 86_400_000; // today's time hasn't arrived → yesterday's occurrence
  if (now.getTime() - occ > 12 * 3_600_000) return null; // >12h late → wait for tomorrow's occurrence
  return `autopilot_mark:${run.id}:${new Date(occ).toISOString().slice(0, 10)}`;
}

// ── Candidate sourcing (shared with the legacy single-run flow) ───────────────

async function buildQueue(run: { categories: string[]; keyword: string }, enabledSources: NewsSourceId[]): Promise<{ queue: { item: NormalizedItem; catName: string }[]; noCats: boolean }> {
  const allCats = await prisma.category.findMany({ orderBy: { name: "asc" }, select: { name: true, slug: true } });
  const selected = run.categories.length ? allCats.filter((c) => run.categories.includes(c.slug)) : allCats;
  const cats = selected.length ? selected : allCats;
  if (cats.length === 0) return { queue: [], noCats: true };

  const kw = run.keyword.trim();
  const perCat = await Promise.all(
    cats.map(async (c) => {
      try {
        const res = await aggregateTrending({
          enabled: enabledSources,
          query: { category: c.name.toLowerCase(), query: kw, lang: "en", country: "us", page: 1 },
        });
        return { cat: c, items: res.items };
      } catch {
        return { cat: c, items: [] as NormalizedItem[] };
      }
    }),
  );

  // De-dupe across categories, then interleave (round-robin) so drafts span topics.
  const seenUrls = new Set<string>();
  const seenToks: Set<string>[] = [];
  const groups = perCat.map((p) => ({
    cat: p.cat,
    items: p.items.filter((it) => {
      const k = urlKey(it.url);
      if (seenUrls.has(k)) return false;
      const tok = titleTokens(it.title);
      if (seenToks.some((t) => jaccard(t, tok) >= TITLE_SIM)) return false;
      seenUrls.add(k);
      seenToks.push(tok);
      return true;
    }),
  }));
  const queue: { item: NormalizedItem; catName: string }[] = [];
  for (let i = 0; ; i++) {
    let added = false;
    for (const g of groups) {
      if (g.items[i]) { queue.push({ item: g.items[i], catName: g.cat.name }); added = true; }
    }
    if (!added) break;
  }
  return { queue, noCats: false };
}

// ── One Run ───────────────────────────────────────────────────────────────────

/**
 * Execute one Run: draft N original articles, then (publish mode only, unless
 * `forceDraft` or the kill switch) auto-publish or stagger them within the global
 * daily cap. Never throws — failures are logged + pushed. `forceDraft` makes the
 * manual "Run now" always draft-only for safe testing.
 */
async function runAutopilotRun(
  run: AutopilotRun,
  settings: AgentSettings,
  opts: { deadlineMs: number; manual?: boolean; forceDraft?: boolean; source: string },
): Promise<RunOutcome> {
  const label = autopilotRunLabel(run);

  if (!isAiConfigured()) return finalize(run, { ok: false, created: 0, published: 0, scheduled: 0, titles: [], errors: [], message: "AI isn’t set up (ANTHROPIC_API_KEY)." }, opts);
  const enabledSources = NEWS_SOURCE_IDS.filter(isSourceConfigured);
  if (enabledSources.length === 0) return finalize(run, { ok: false, created: 0, published: 0, scheduled: 0, titles: [], errors: [], message: "No news sources are configured." }, opts);

  const { queue, noCats } = await buildQueue(run, enabledSources);
  if (noCats) return finalize(run, { ok: false, created: 0, published: 0, scheduled: 0, titles: [], errors: [], message: "No categories exist to draft from." }, opts);
  if (queue.length === 0) return finalize(run, { ok: false, created: 0, published: 0, scheduled: 0, titles: [], errors: [], message: "No trending stories were found." }, opts);

  const existing = await prisma.article.findMany({ orderBy: { createdAt: "desc" }, take: RECENT_TITLES, select: { title: true } });
  const existingToks = existing.map((e) => titleTokens(e.title));

  const target = Math.min(5, Math.max(1, run.count));
  const createdIds: string[] = [];
  const titles: string[] = [];
  const errors: string[] = [];

  for (const cand of queue) {
    if (createdIds.length >= target) break;
    if (Date.now() + DRAFT_TIMEOUT_MS > opts.deadlineMs) {
      errors.push("Stopped early to stay within the function time limit.");
      break;
    }
    const tok = titleTokens(cand.item.title);
    if (existingToks.some((t) => jaccard(t, tok) >= TITLE_SIM)) continue;
    const dup = await prisma.article.findFirst({ where: { content: { contains: cand.item.url } }, select: { id: true } });
    if (dup) continue;

    try {
      const res = await withTimeout(
        executeTool(
          "create_draft",
          { topic: cand.item.title, source_url: cand.item.url, source_title: cand.item.source || cand.item.title, category: cand.catName },
          { model: settings.model ?? undefined, settings },
        ),
        DRAFT_TIMEOUT_MS,
        "Draft",
      );
      if (res.isError) { errors.push(res.summary); continue; }
      let title = cand.item.title;
      let id: string | undefined;
      try {
        const parsed = JSON.parse(res.content) as { id?: string; title?: string };
        if (parsed?.title) title = parsed.title;
        if (parsed?.id) id = parsed.id;
      } catch { /* keep the source title for the log */ }
      if (id) createdIds.push(id);
      titles.push(title);
      existingToks.push(tok);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Draft failed.");
    }
  }

  // Auto-publish (publish mode only; never on a forced-draft manual test; respect
  // the kill switch + the global daily cap). The featured image is best-effort in
  // create_draft; with none, the article still has the branded OG card as its
  // social image, so publishing is never blocked on an image.
  let published = 0;
  let scheduled = 0;
  const wantPublish = run.mode === "publish" && !opts.forceDraft && !settings.autopilot.pauseAutoPublish;
  if (wantPublish && createdIds.length > 0) {
    const ppDate = ppDateNow();
    const already = await readPubCount(ppDate);
    const allowance = Math.max(0, settings.autopilot.dailyAutoPublishCap - already);
    const toAct = createdIds.slice(0, allowance); // never exceed the daily cap (or the Run count)
    if (toAct.length < createdIds.length) errors.push(`Daily auto-publish cap reached — ${createdIds.length - toAct.length} left as draft(s).`);

    if (run.publishMode === "now") {
      for (const id of toAct) {
        try {
          const r = await publishScheduledArticleById(id, { logActivity: true });
          if (r.published) published++;
        } catch (e) {
          errors.push(e instanceof Error ? e.message : "Publish failed.");
        }
      }
    } else {
      // Stagger into the next free preferred slots (the publish-due cron fires them).
      const taken = await prisma.article.findMany({ where: { status: "scheduled", scheduledAt: { not: null } }, select: { scheduledAt: true } });
      const takenUtcMs = taken.map((t) => t.scheduledAt!.getTime());
      const slots = nextFreeSlots({ times: settings.preferredTimes, count: toAct.length, takenUtcMs });
      for (let i = 0; i < toAct.length; i++) {
        const iso = slots[i];
        if (!iso) { errors.push("Ran out of free posting slots."); break; }
        try {
          await prisma.article.update({ where: { id: toAct[i] }, data: { status: "scheduled", scheduledAt: new Date(iso), publishedAt: null, scheduleSource: label } });
          scheduled++;
        } catch (e) {
          errors.push(e instanceof Error ? e.message : "Schedule failed.");
        }
      }
    }
    await bumpPubCount(ppDate, published + scheduled);
  }

  const ok = createdIds.length > 0 || titles.length > 0;
  return finalize(run, { ok, created: titles.length, published, scheduled, titles, errors }, opts);
}

/** Log the Run to the activity log + send ONE mode-aware push. */
async function finalize(run: AutopilotRun, r: RunOutcome, opts: { manual?: boolean; source: string }): Promise<RunOutcome> {
  const label = autopilotRunLabel(run);
  const acted = r.published + r.scheduled;
  let summary: string;
  if (!r.ok) {
    summary = `${label} couldn’t run${r.message ? ` — ${r.message}` : ""}`;
  } else if (acted > 0) {
    const parts = [r.published ? `${r.published} published` : "", r.scheduled ? `${r.scheduled} scheduled` : ""].filter(Boolean);
    summary = `${label}: ${parts.join(", ")}`;
  } else {
    summary = `${label}: ${r.created} draft${r.created === 1 ? "" : "s"} ready for review`;
  }
  const detail = [
    r.titles.length ? `Articles: ${r.titles.map((t) => `“${t}”`).join("; ")}` : "",
    r.errors.length ? `Notes: ${r.errors.join("; ")}` : "",
    opts.manual ? "Triggered manually (Run now)" : `Scheduled run (${opts.source})`,
  ]
    .filter(Boolean)
    .join(" · ");

  await addAction({
    type: "autopilot_run",
    status: r.ok ? "done" : "failed",
    summary,
    detail,
    params: { created: r.created, published: r.published, scheduled: r.scheduled, mode: run.mode, manual: Boolean(opts.manual) },
  }).catch(() => {});

  const body = !r.ok
    ? r.message || "Auto-Pilot could not run"
    : acted > 0
      ? `${label}: ${[r.published ? `${r.published} published` : "", r.scheduled ? `${r.scheduled} scheduled` : ""].filter(Boolean).join(", ")}`
      : `${r.created} draft${r.created === 1 ? "" : "s"} ready for review`;
  await sendAutopilotPush({ ok: r.ok, count: r.created, body, url: acted > 0 ? "/admin/scheduled" : "/admin/articles" }).catch(() => {});

  return r;
}

// ── Public entry points ───────────────────────────────────────────────────────

/** Build a draft-only synthetic Run from the configured Runs, for the manual "Run
 *  now" test button (covers all configured categories, never auto-publishes). */
function manualRunOf(settings: AgentSettings): AutopilotRun {
  const runs = settings.autopilot.runs.filter((r) => r.enabled);
  const cats = [...new Set(runs.flatMap((r) => r.categories))];
  const count = Math.min(5, Math.max(1, Math.max(3, ...runs.map((r) => r.count), 0)));
  return { id: "manual", timeUtc: "00:00", categories: cats, keyword: "", count, mode: "draft", publishMode: "stagger", enabled: true };
}

/**
 * Manual "Run now" (Agent Settings button / admin route). Always DRAFT-only for
 * safe testing — it never auto-publishes, whatever the Runs are configured to do.
 * Returns the legacy AutopilotResult shape the button + route already read.
 */
export async function runAutopilot({ manual }: { manual: boolean }): Promise<AutopilotResult> {
  const settings = await getAgentSettings();
  if (!manual && !settings.autopilot.enabled) {
    return { ok: true, skipped: true, reason: "disabled", created: 0, titles: [], errors: [] };
  }
  const run = manualRunOf(settings);
  const r = await runAutopilotRun(run, settings, { deadlineMs: Date.now() + HARD_LIMIT_MS - FINALIZE_MS, manual: true, forceDraft: true, source: "manual" });
  return { ok: r.ok, created: r.created, titles: r.titles, errors: r.errors, message: r.message };
}

/**
 * Dispatch due Runs — called from the pinger-driven /api/cron/publish-due (and the
 * daily Vercel cron safety net). Processes at most ONE due Run per call (bounded by
 * `budgetMs`), claiming it atomically so it never runs twice. Returns a small
 * summary for the cron response.
 */
export async function runDueAutopilot(opts: { budgetMs: number }): Promise<{ ran: number; skipped?: boolean; reason?: string; run?: string; published?: number; scheduled?: number; created?: number }> {
  if (opts.budgetMs < MIN_RUN_MS) return { ran: 0, skipped: true, reason: "insufficient-budget" };
  const settings = await getAgentSettings();
  if (!settings.autopilot.enabled) return { ran: 0, skipped: true, reason: "disabled" };

  await cleanupMarks();
  const now = new Date();
  for (const run of settings.autopilot.runs) {
    if (!run.enabled) continue;
    const markKey = dueMarkKey(now, run);
    if (!markKey) continue;
    const claimed = await claimMark(markKey);
    if (!claimed) continue; // already ran for this occurrence

    const deadlineMs = Date.now() + Math.min(opts.budgetMs, HARD_LIMIT_MS) - FINALIZE_MS;
    const r = await runAutopilotRun(run, settings, { deadlineMs, source: "schedule" });
    return { ran: 1, run: autopilotRunLabel(run), published: r.published, scheduled: r.scheduled, created: r.created };
  }
  return { ran: 0 };
}
