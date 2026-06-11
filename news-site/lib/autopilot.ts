import "server-only";

import { prisma } from "@/lib/db";
import { getAgentSettings, addAction } from "@/lib/agent/store";
import { aggregateTrending, isSourceConfigured } from "@/lib/news/aggregate";
import { NEWS_SOURCE_IDS } from "@/lib/news/sources";
import { titleTokens, jaccard, urlKey, type NormalizedItem } from "@/lib/news/normalize";
import { executeTool } from "@/lib/agent/tools";
import { isAiConfigured } from "@/lib/aiAssist";
import { sendAutopilotPush } from "@/lib/agent/push";

// ── Morning Auto-Pilot ───────────────────────────────────────────────────────
// Once a day (or on demand) this finds top trending stories across the site's
// categories, writes N ORIGINAL drafts via the EXISTING agent draft tool (which
// reuses the AI pipeline + adds a source-attribution link), and sends ONE push.
// It ONLY ever creates DRAFTS — it never publishes or shares. Everything it
// touches (news fetch, AI, drafts, push, activity log) is reused, not duplicated.

// Hobby functions cap at 60s (maxDuration). Never START a draft unless it can
// finish — even if it hits DRAFT_TIMEOUT_MS — with headroom left under 60s to send
// the push + write the activity log. (HARD_LIMIT + finalize < 60s.)
const HARD_LIMIT_MS = 56_000;
// Hard cap per draft so one slow AI call can't blow the whole budget.
const DRAFT_TIMEOUT_MS = 16_000;
// Similar-title threshold (matches the news de-duper) for skip-if-already-covered.
const TITLE_SIM = 0.82;
// How many recent articles to compare titles against for dedupe.
const RECENT_TITLES = 400;

export type AutopilotResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  created: number;
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

/**
 * Run the Auto-Pilot job. `manual` (the "Run now" button / admin route) runs even
 * while the feature is toggled OFF; the daily cron passes manual=false and no-ops
 * when disabled. Never throws — failures are logged + pushed, not crashed.
 */
export async function runAutopilot({ manual }: { manual: boolean }): Promise<AutopilotResult> {
  const start = Date.now();
  const settings = await getAgentSettings();
  const ap = settings.autopilot;

  // Scheduled + disabled → silent no-op (no draft, no push, no log spam).
  if (!manual && !ap.enabled) {
    return { ok: true, skipped: true, reason: "disabled", created: 0, titles: [], errors: [] };
  }

  // Preconditions: AI key + at least one news source.
  if (!isAiConfigured()) {
    return finalize({ ok: false, created: 0, titles: [], errors: [], manual, message: "AI isn’t set up (ANTHROPIC_API_KEY)." });
  }
  const enabledSources = NEWS_SOURCE_IDS.filter(isSourceConfigured);
  if (enabledSources.length === 0) {
    return finalize({ ok: false, created: 0, titles: [], errors: [], manual, message: "No news sources are configured." });
  }

  // Categories to cover (settings selection, else all the site's categories).
  const allCats = await prisma.category.findMany({ orderBy: { name: "asc" }, select: { name: true, slug: true } });
  const selected = ap.categories.length ? allCats.filter((c) => ap.categories.includes(c.slug)) : allCats;
  const cats = selected.length ? selected : allCats;
  if (cats.length === 0) {
    return finalize({ ok: false, created: 0, titles: [], errors: [], manual, message: "No categories exist to draft from." });
  }

  // Pull trending per category in parallel (each source has its own cache + quota
  // backoff, so this respects the small daily quotas). One failing category/source
  // contributes nothing rather than breaking the run.
  const perCat = await Promise.all(
    cats.map(async (c) => {
      try {
        const res = await aggregateTrending({
          enabled: enabledSources,
          query: { category: c.name.toLowerCase(), query: "", lang: "en", country: "us", page: 1 },
        });
        return { cat: c, items: res.items };
      } catch {
        return { cat: c, items: [] as NormalizedItem[] };
      }
    }),
  );

  // De-dupe candidates ACROSS categories (same story can surface in several), then
  // interleave by category (round-robin) so the drafts span topics.
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
  if (queue.length === 0) {
    return finalize({ ok: false, created: 0, titles: [], errors: [], manual, message: "No trending stories were found." });
  }

  // Existing article titles, to skip stories we already drafted/published.
  const existing = await prisma.article.findMany({ orderBy: { createdAt: "desc" }, take: RECENT_TITLES, select: { title: true } });
  const existingToks = existing.map((e) => titleTokens(e.title));

  const target = Math.min(5, Math.max(1, ap.draftCount));
  const titles: string[] = [];
  const errors: string[] = [];

  for (const cand of queue) {
    if (titles.length >= target) break;
    if (Date.now() - start + DRAFT_TIMEOUT_MS > HARD_LIMIT_MS) {
      errors.push("Stopped early to stay within the function time limit.");
      break;
    }

    // Dedupe: very similar to an existing title?
    const tok = titleTokens(cand.item.title);
    if (existingToks.some((t) => jaccard(t, tok) >= TITLE_SIM)) continue;
    // Dedupe: is this exact source URL already cited in an article body?
    const dup = await prisma.article.findFirst({ where: { content: { contains: cand.item.url } }, select: { id: true } });
    if (dup) continue;

    try {
      const res = await withTimeout(
        executeTool(
          "create_draft",
          {
            topic: cand.item.title,
            source_url: cand.item.url,
            source_title: cand.item.source || cand.item.title,
            category: cand.catName,
          },
          { model: settings.model ?? undefined, settings },
        ),
        DRAFT_TIMEOUT_MS,
        "Draft",
      );
      if (res.isError) {
        errors.push(res.summary);
        continue;
      }
      let title = cand.item.title;
      try {
        const parsed = JSON.parse(res.content) as { title?: string };
        if (parsed?.title) title = parsed.title;
      } catch {
        /* keep the source title for the log */
      }
      titles.push(title);
      existingToks.push(tok); // don't pick a near-duplicate again within this run
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Draft failed.");
    }
  }

  return finalize({ ok: titles.length > 0, created: titles.length, titles, errors, manual });
}

/** Log the run to the agent activity log + send the single summary push. */
async function finalize(args: {
  ok: boolean;
  created: number;
  titles: string[];
  errors: string[];
  manual: boolean;
  message?: string;
}): Promise<AutopilotResult> {
  const { ok, created, titles, errors, manual, message } = args;
  const summary = ok
    ? `Auto-Pilot: ${created} draft${created === 1 ? "" : "s"} ready for review`
    : `Auto-Pilot couldn’t run${message ? ` — ${message}` : " today"}`;

  const detail = [
    titles.length ? `Drafts: ${titles.map((t) => `“${t}”`).join("; ")}` : "",
    errors.length ? `Notes: ${errors.join("; ")}` : "",
    manual ? "Triggered manually (Run now)" : "Scheduled run",
  ]
    .filter(Boolean)
    .join(" · ");

  await addAction({
    type: "autopilot_run",
    status: ok ? "done" : "failed",
    summary,
    detail,
    params: { created, manual },
  }).catch(() => {});

  await sendAutopilotPush({ ok, count: created, message, url: "/admin/articles" }).catch(() => {});

  return { ok, created, titles, errors, message };
}
