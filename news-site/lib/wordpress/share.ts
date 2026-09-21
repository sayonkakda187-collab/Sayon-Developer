/**
 * Pure helpers for the post-publish share panel.
 *
 * They live OUTSIDE `client.ts` — which opens with `import "server-only"` — so
 * that a test runner can import them. Same reason `format.ts` exists.
 */

/**
 * The publication a WordPress post belongs to, for the caption's closing line.
 *
 * Derived from the POST'S OWN link rather than from `siteConfig`, and that is
 * the whole point: posts published from this panel live on a DIFFERENT
 * WordPress site. Reusing this site's name — the way the article Share panel
 * legitimately does — would credit the wrong publication on every caption.
 */
export function siteLabelFromUrl(link: string): string {
  try {
    const host = new URL(link).hostname.replace(/^www\./i, "");
    return host || "";
  } catch {
    return "";
  }
}

/**
 * A ready-to-paste caption: headline, the excerpt as a hook, then the link.
 *
 * Mirrors the article panel's caption so the two screens produce the same shape
 * of text. The excerpt is optional because WordPress leaves it empty unless the
 * author fills it in, and an empty hook should not leave a blank line behind.
 */
export function buildWpCaption(title: string, excerpt: string | null | undefined, link: string): string {
  const parts = [title.trim()];
  const hook = (excerpt ?? "").trim();
  if (hook) parts.push("", hook);
  const site = siteLabelFromUrl(link);
  parts.push("", site ? `Read the full story on ${site}:` : "Read the full story:", link);
  return parts.join("\n");
}

/**
 * Caption + link, ready to paste. The default caption already ends with the
 * link, so it is only appended when an edited caption dropped it — otherwise
 * every paste would carry the URL twice.
 */
export function captionWithLink(caption: string, link: string): string {
  const text = caption.trim();
  return text.includes(link) ? text : `${text}\n\n${link}`;
}
