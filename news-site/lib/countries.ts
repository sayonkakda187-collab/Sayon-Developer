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
