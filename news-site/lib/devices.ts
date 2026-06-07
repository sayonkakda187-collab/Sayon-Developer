// Device helpers: a coarse device class (mobile / desktop / tablet) → label +
// accent colour. Pure and client-safe (no server-only imports), so both the
// tracking code and the admin dashboard can share it.
//
// The class is derived from the request User-Agent server-side (see the article
// page + lib/queries.ts) and only the bucket is ever stored — never the raw UA.

export const DEVICE_TYPES = ["mobile", "desktop", "tablet"] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

/** Display order: phones first (the bulk of news traffic), then desktop, tablet. */
export const DEVICE_ORDER: DeviceType[] = ["mobile", "desktop", "tablet"];

/**
 * Coerce any string to one of the known device buckets. Anything unrecognised
 * (including the empty/undefined User-Agent device type that desktop browsers
 * send) maps to "desktop" — the conventional default for "no device type".
 */
export function normalizeDevice(raw?: string | null): DeviceType {
  const d = (raw ?? "").trim().toLowerCase();
  return d === "mobile" || d === "tablet" ? d : "desktop";
}

/** Device class → human label. */
export function deviceLabel(device: string): string {
  switch (normalizeDevice(device)) {
    case "mobile":
      return "Mobile";
    case "tablet":
      return "Tablet";
    default:
      return "Desktop";
  }
}

/** Distinct, theme-friendly accent per device class (shared by bar + legend). */
export const DEVICE_COLORS: Record<DeviceType, string> = {
  mobile: "#2563eb", // blue
  desktop: "#16a34a", // green
  tablet: "#f59e0b", // amber
};

export function deviceColor(device: string): string {
  return DEVICE_COLORS[normalizeDevice(device)];
}
