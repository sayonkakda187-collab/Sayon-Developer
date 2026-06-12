// Date-range helpers for the Facebook Insights day-level view. Everything is in
// Asia/Phnom_Penh, a FIXED UTC+07:00 (no DST), matching the scheduler
// (lib/fbSchedule.ts). Pure functions — safe to import from client components
// AND server code (no "server-only"), so the picker, the API route, and the
// insights service all bucket days the same way.

export const PP_TZ = "Asia/Phnom_Penh";
const PP_OFFSET = "+07:00";

/** Phnom-Penh calendar date (YYYY-MM-DD) of a UTC instant. */
export function ppDate(d: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: PP_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Today's Phnom-Penh date (YYYY-MM-DD). */
export function ppToday(): string {
  return ppDate(new Date());
}

/** Add `n` days to a YYYY-MM-DD string (calendar math, tz-independent). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Every date from `from`..`to` inclusive (clamped to ~370 to stay sane). */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  for (let i = 0; i < 370 && cur <= to; i++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Inclusive day count of a range (1 = single day). */
export function dayCount(from: string, to: string): number {
  return Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1);
}

/**
 * Unix-second window covering the FULL Phnom-Penh days [from 00:00 +07,
 * (to+1) 00:00 +07) — what we pass to the Graph API as since/until.
 */
export function rangeToUnix(from: string, to: string): { since: number; until: number } {
  const since = Math.floor(new Date(`${from}T00:00:00${PP_OFFSET}`).getTime() / 1000);
  const until = Math.floor(new Date(`${addDays(to, 1)}T00:00:00${PP_OFFSET}`).getTime() / 1000);
  return { since, until };
}

/**
 * The Phnom-Penh day a Graph `period=day` value belongs to. Graph sets `end_time`
 * to the END of the day window, so we map (end_time − 1s) → its PP date (a
 * midnight-PP boundary then attributes to the day that just ended, not the next).
 */
export function ppDayOfEndTime(endTime: string): string {
  const t = Date.parse(endTime);
  if (Number.isNaN(t)) return endTime.slice(0, 10);
  return ppDate(new Date(t - 1000));
}

export type RangePreset = "today" | "yesterday" | "7d" | "28d" | "90d" | "custom";

/** Resolve a preset to a concrete from/to (Phnom-Penh dates). */
export function presetRange(preset: RangePreset, today = ppToday()): { from: string; to: string } {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "28d":
      return { from: addDays(today, -27), to: today };
    case "90d":
      return { from: addDays(today, -89), to: today };
    default:
      return { from: today, to: today };
  }
}

/** Stable cache key for a (page, range) daily snapshot. */
export function rangeKey(from: string, to: string): string {
  return `${from}_${to}`;
}

/** "Jun 11" style short label for a YYYY-MM-DD day. */
export function formatDay(date: string): string {
  const d = new Date(`${date}T12:00:00${PP_OFFSET}`);
  return d.toLocaleDateString("en-US", { timeZone: PP_TZ, month: "short", day: "numeric" });
}

/** Human label for a whole range ("Jun 11", or "Jun 5 – Jun 11"). */
export function formatRange(from: string, to: string): string {
  return from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`;
}
