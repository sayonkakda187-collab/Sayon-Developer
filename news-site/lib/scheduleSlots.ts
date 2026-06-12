import { localInputToUtcISO, toLocalInput } from "./fbSchedule";

// Pure, client-safe helpers for "preferred posting time" slots. Times are
// Asia/Phnom_Penh wall-clock "HH:mm" (24h); slots are returned as UTC ISO strings.
// Reuses lib/fbSchedule for the fixed +07:00 conversion. Used by the approval-card
// presets, the editor, the "next free slot" auto-stagger, and Agent Settings.

export const DEFAULT_PREFERRED_TIMES = ["19:00", "21:00", "23:00"];

export function isHHMM(s: unknown): s is string {
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** Clean a list of preferred times: keep valid HH:mm, de-dupe, sort ascending. */
export function normalizePreferredTimes(times: unknown): string[] {
  if (!Array.isArray(times)) return [...DEFAULT_PREFERRED_TIMES];
  const valid = [...new Set(times.filter(isHHMM))].sort();
  return valid.length ? valid : [...DEFAULT_PREFERRED_TIMES];
}

/** "YYYY-MM-DD" + n calendar days (TZ-agnostic — used only to build PP wall clocks). */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/**
 * The next `count` free preferred slots (UTC ISO) at the given PP times, strictly
 * after `fromUtcMs`, skipping any within `tolMin` of an already-taken instant.
 * This powers both the preset chips and "auto-stagger" (approving several drafts
 * each lands on the next open slot).
 */
export function nextFreeSlots(opts: {
  times: string[];
  fromUtcMs?: number;
  count: number;
  takenUtcMs?: number[];
  horizonDays?: number;
  tolMin?: number;
}): string[] {
  const times = normalizePreferredTimes(opts.times);
  const from = opts.fromUtcMs ?? Date.now();
  const horizon = opts.horizonDays ?? 21;
  const tol = (opts.tolMin ?? 1) * 60_000;
  const used = [...(opts.takenUtcMs ?? [])];
  const startDay = toLocalInput(new Date(from)).slice(0, 10); // PP date of `from`
  const out: string[] = [];

  for (let d = 0; d < horizon && out.length < opts.count; d++) {
    const day = addDays(startDay, d);
    for (const t of times) {
      const iso = localInputToUtcISO(`${day}T${t}`);
      if (!iso) continue;
      const ms = Date.parse(iso);
      if (ms <= from) continue;
      if (used.some((u) => Math.abs(u - ms) < tol)) continue;
      out.push(iso);
      used.push(ms);
      if (out.length >= opts.count) break;
    }
  }
  return out;
}
