// Country helpers: ISO 3166-1 alpha-2 → flag emoji + English name. Pure and
// client-safe. "ZZ" (and anything invalid) → a neutral "Unknown" / globe.

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

function isAlpha2(c: string): boolean {
  return /^[A-Z]{2}$/.test(c) && c !== "ZZ";
}

/** Alpha-2 → flag emoji (two regional-indicator letters). Unknown → 🌐. */
export function countryFlag(code: string): string {
  const c = (code || "").trim().toUpperCase();
  if (!isAlpha2(c)) return "🌐";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

/** Alpha-2 → English country name. Unknown → "Unknown". */
export function countryName(code: string): string {
  const c = (code || "").trim().toUpperCase();
  if (!isAlpha2(c)) return "Unknown";
  try {
    return regionNames?.of(c) ?? c;
  } catch {
    return c;
  }
}

/** A palette of distinct, pleasant accent colours used to tint each country on
 *  the audience map + list. */
export const COUNTRY_PALETTE = [
  "#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#a855f7", "#0ea5e9",
  "#14b8a6", "#f97316", "#ec4899", "#84cc16", "#6366f1", "#eab308",
  "#06b6d4", "#d946ef", "#22c55e", "#fb7185",
];

/**
 * A colour for a country. Pass the row `index` (rank) to guarantee the top
 * countries are all visually distinct (palette by rank); otherwise a stable
 * hash of the code is used. The same data order is fed to the map + list, so a
 * country reads as the same colour in both.
 */
export function countryColor(code: string, index?: number): string {
  if (typeof index === "number" && index >= 0) {
    return COUNTRY_PALETTE[index % COUNTRY_PALETTE.length];
  }
  const c = (code || "").trim().toUpperCase();
  let h = 0;
  for (let i = 0; i < c.length; i++) h = (h * 31 + c.charCodeAt(i)) >>> 0;
  return COUNTRY_PALETTE[h % COUNTRY_PALETTE.length];
}
