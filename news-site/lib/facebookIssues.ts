/**
 * Operational "issue" labels an admin can flag on a connected Facebook Page so it
 * surfaces in the Pages manager's "Needs attention" box — separate from the token
 * status (Connected/Expired). These are suggestions, not a hard enum: the manager
 * also accepts a custom label, and any value already in the DB is shown as-is.
 * Plain data so it can be imported by both Server and Client Components.
 */
export const FACEBOOK_PAGE_ISSUES = [
  "Limited post",
  "Post failed",
  "Verify identity",
  "Restricted",
] as const;

export type FacebookPageIssue = (typeof FACEBOOK_PAGE_ISSUES)[number];

/** Sort helper: known issues in defined order first, then any custom ones A–Z. */
export function sortIssues(issues: string[]): string[] {
  const order = new Map(FACEBOOK_PAGE_ISSUES.map((g, i) => [g, i] as const));
  return [...issues].sort((a, b) => {
    const ai = order.get(a as FacebookPageIssue);
    const bi = order.get(b as FacebookPageIssue);
    if (ai != null && bi != null) return ai - bi;
    if (ai != null) return -1;
    if (bi != null) return 1;
    return a.localeCompare(b);
  });
}
