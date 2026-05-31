/**
 * Niche / category groups a Facebook Page can be assigned to. Used to group the
 * pages table and the per-page checkboxes in the article editor. Plain data so
 * it can be imported by both Server and Client Components.
 *
 * These are suggestions, not a hard enum — the connect form also accepts a
 * custom group, and any value already in the DB is grouped as-is.
 */
export const FACEBOOK_CATEGORY_GROUPS = [
  "US News",
  "KH News",
  "Entertainment",
  "Sports",
  "Business",
  "Technology",
  "World",
] as const;

export type FacebookCategoryGroup = (typeof FACEBOOK_CATEGORY_GROUPS)[number];

/** Sort helper: known groups in defined order first, then any custom groups A–Z. */
export function sortCategoryGroups(groups: string[]): string[] {
  const order = new Map(FACEBOOK_CATEGORY_GROUPS.map((g, i) => [g, i]));
  return [...groups].sort((a, b) => {
    const ai = order.get(a as FacebookCategoryGroup);
    const bi = order.get(b as FacebookCategoryGroup);
    if (ai != null && bi != null) return ai - bi;
    if (ai != null) return -1;
    if (bi != null) return 1;
    return a.localeCompare(b);
  });
}
