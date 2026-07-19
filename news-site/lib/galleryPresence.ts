import "server-only";

import { prisma } from "@/lib/db";

/**
 * Live-viewer presence for the private galleries — stored WITHOUT a schema change,
 * one row per active viewer in the existing `AppSetting` table, keyed
 * "gpres:<token>:<visitorId>". The value is a small JSON blob { ts, country,
 * device }. Each open /g/<token> page heartbeats every ~15s; a viewer counts as
 * "watching now" if seen within LIVE_WINDOW_MS. Rows older than PRUNE_AFTER_MS are
 * deleted on read, so the table never grows unbounded. Counts only — no PII.
 */

const PREFIX = "gpres:";
const LIVE_WINDOW_MS = 35_000; // seen within 35s → live (2+ heartbeats of slack)
const PRUNE_AFTER_MS = 120_000; // delete records older than 2 min

// Rolling reader-count time series (whos.amung.us-style live graph). One JSON row
// per gallery, keyed "gseries:<token>", holding minute-bucketed peak concurrent
// readers for the last hour. Sampled straight from visitor heartbeats (throttled),
// so the graph keeps its history even while the admin isn't watching.
const SERIES_PREFIX = "gseries:";
const SERIES_BUCKET_MS = 60_000; // 1-minute buckets
export const SERIES_WINDOW_MS = 60 * 60_000; // keep last 60 minutes
export const SERIES_WINDOW_MIN = 60;
const SAMPLE_MIN_GAP_MS = 20_000; // at most ~1 sample / 20s per gallery

export type GalleryLive = {
  count: number;
  countries: Record<string, number>;
  devices: Record<string, number>;
};

/** One point of the reader time series: `t` = minute-bucket start (ms), `c` = peak count. */
export type SeriesPoint = { t: number; c: number };
type SeriesRec = { last: number; points: SeriesPoint[] };

const keyFor = (token: string, visitorId: string) => `${PREFIX}${token}:${visitorId}`;

/** Heartbeat: record/refresh one viewer's presence on a gallery. */
export async function recordPresence(
  token: string,
  visitorId: string,
  country: string,
  device: string,
): Promise<void> {
  const value = JSON.stringify({
    ts: Date.now(),
    country: country || "ZZ",
    device: device || "desktop",
  });
  const key = keyFor(token, visitorId);
  await prisma.appSetting.upsert({
    where: { key },
    update: { value, encrypted: false },
    create: { key, value, encrypted: false },
  });
}

/** Admin: live counts per gallery token (+ country/device breakdown). Prunes
 *  stale rows as a side effect so the table self-cleans. */
export async function getLivePresence(): Promise<Record<string, GalleryLive>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: PREFIX } } });
  const now = Date.now();
  const stale: string[] = [];
  const byToken: Record<string, GalleryLive> = {};

  for (const r of rows) {
    // key = gpres:<token>:<visitorId>  — token is the first segment after PREFIX.
    const rest = r.key.slice(PREFIX.length);
    const sep = rest.indexOf(":");
    const token = sep >= 0 ? rest.slice(0, sep) : rest;

    let ts = 0;
    let country = "ZZ";
    let device = "desktop";
    try {
      const o = JSON.parse(r.value) as { ts?: number; country?: string; device?: string };
      ts = typeof o.ts === "number" ? o.ts : 0;
      if (typeof o.country === "string") country = o.country;
      if (typeof o.device === "string") device = o.device;
    } catch {
      /* treat as stale below */
    }

    if (now - ts > PRUNE_AFTER_MS) {
      stale.push(r.key);
      continue;
    }
    if (now - ts <= LIVE_WINDOW_MS) {
      const b = (byToken[token] ??= { count: 0, countries: {}, devices: {} });
      b.count += 1;
      b.countries[country] = (b.countries[country] || 0) + 1;
      b.devices[device] = (b.devices[device] || 0) + 1;
    }
  }

  if (stale.length) {
    await prisma.appSetting.deleteMany({ where: { key: { in: stale } } }).catch(() => {});
  }
  return byToken;
}

/**
 * Fold the current live-reader count for ONE gallery into its rolling time series.
 * Called (best-effort) from each heartbeat, but throttled to ~once/20s per gallery
 * so it costs little. Also prunes that gallery's own stale presence rows, so the
 * table stays bounded even when the admin never opens the live dashboard.
 */
export async function sampleGallerySeries(token: string): Promise<void> {
  const key = SERIES_PREFIX + token;
  const now = Date.now();

  const existing = await prisma.appSetting.findUnique({ where: { key } });
  let rec: SeriesRec = { last: 0, points: [] };
  if (existing?.value) {
    try {
      const o = JSON.parse(existing.value) as Partial<SeriesRec>;
      rec = {
        last: typeof o.last === "number" ? o.last : 0,
        points: Array.isArray(o.points) ? o.points : [],
      };
    } catch {
      /* corrupt → overwrite below */
    }
  }
  // Throttle: skip the (heavier) count scan if we sampled very recently.
  if (now - rec.last < SAMPLE_MIN_GAP_MS) return;

  // Current concurrent readers of THIS gallery; prune its stale rows in passing.
  const rows = await prisma.appSetting.findMany({
    where: { key: { startsWith: `${PREFIX}${token}:` } },
  });
  let count = 0;
  const stale: string[] = [];
  for (const r of rows) {
    let ts = 0;
    try {
      const o = JSON.parse(r.value) as { ts?: number };
      ts = typeof o.ts === "number" ? o.ts : 0;
    } catch {
      /* stale */
    }
    if (now - ts > PRUNE_AFTER_MS) stale.push(r.key);
    else if (now - ts <= LIVE_WINDOW_MS) count += 1;
  }
  if (stale.length) {
    await prisma.appSetting.deleteMany({ where: { key: { in: stale } } }).catch(() => {});
  }

  // Fold into the current minute bucket (keep the peak), drop points past the window.
  const bucket = Math.floor(now / SERIES_BUCKET_MS) * SERIES_BUCKET_MS;
  const points = rec.points.filter((p) => p && typeof p.t === "number" && now - p.t <= SERIES_WINDOW_MS);
  const last = points[points.length - 1];
  if (last && last.t === bucket) last.c = Math.max(last.c, count);
  else points.push({ t: bucket, c: count });

  const value = JSON.stringify({ last: now, points } satisfies SeriesRec);
  await prisma.appSetting
    .upsert({ where: { key }, update: { value, encrypted: false }, create: { key, value, encrypted: false } })
    .catch(() => {});
}

/** Admin: per-gallery reader time series (last hour), pruned on read. */
export async function getGallerySeries(): Promise<Record<string, SeriesPoint[]>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: SERIES_PREFIX } } });
  const now = Date.now();
  const out: Record<string, SeriesPoint[]> = {};
  const stale: string[] = [];

  for (const r of rows) {
    const token = r.key.slice(SERIES_PREFIX.length);
    try {
      const rec = JSON.parse(r.value) as Partial<SeriesRec>;
      const points = (Array.isArray(rec.points) ? rec.points : []).filter(
        (p) => p && typeof p.t === "number" && typeof p.c === "number" && now - p.t <= SERIES_WINDOW_MS,
      );
      // Nothing fresh and not touched within the window → the gallery went quiet; drop the row.
      if (points.length === 0 && now - (typeof rec.last === "number" ? rec.last : 0) > SERIES_WINDOW_MS) {
        stale.push(r.key);
        continue;
      }
      if (points.length) out[token] = points;
    } catch {
      stale.push(r.key);
    }
  }

  if (stale.length) {
    await prisma.appSetting.deleteMany({ where: { key: { in: stale } } }).catch(() => {});
  }
  return out;
}
