// Timezone helpers for Facebook post scheduling. The admin works in
// Asia/Phnom_Penh, which is a FIXED UTC+07:00 (no DST, ever) — so a wall-clock
// time entered in a <input type="datetime-local"> is interpreted as +07:00 and
// stored as a UTC instant, regardless of the browser's own timezone. Pure
// functions — safe to import from client components.

export const SCHEDULE_TZ = "Asia/Phnom_Penh";
const TZ_OFFSET = "+07:00"; // Phnom_Penh has no daylight saving

/** Wall-clock parts ("YYYY-MM-DDTHH:mm") of a UTC instant, rendered in Phnom_Penh.
 *  Used to seed <input type="datetime-local"> values. */
export function toLocalInput(date: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHEDULE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Current Phnom_Penh wall-clock, for the picker's `min` (no past times). */
export function nowLocalInput(): string {
  return toLocalInput(new Date());
}

/** A datetime-local value (Phnom_Penh wall-clock) → UTC ISO string for storage.
 *  Returns null if the value is empty/invalid. */
export function localInputToUtcISO(local: string): string | null {
  if (!local) return null;
  const d = new Date(`${local}:00${TZ_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Human-friendly Phnom_Penh rendering of a UTC instant for display lists. */
export function formatSchedule(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("en-US", {
    timeZone: SCHEDULE_TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
