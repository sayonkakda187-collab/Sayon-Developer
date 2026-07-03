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

export type GalleryLive = {
  count: number;
  countries: Record<string, number>;
  devices: Record<string, number>;
};

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
