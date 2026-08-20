// Client-safe Facebook share-mode config + caption/comment templates. No server
// imports here so both the settings UI (browser) and the posting code (server)
// can use the defaults + the renderer.

export type ShareMode = "link" | "photo";

export function isShareMode(v: unknown): v is ShareMode {
  return v === "link" || v === "photo";
}

export const SHARE_MODE_LABEL: Record<ShareMode, string> = {
  link: "Link post",
  photo: "Photo + link in comments",
};

// Tokens: {headline} {excerpt} {credit} {url}
export const DEFAULT_PHOTO_CAPTION = `{headline}

{excerpt}

📖 Read the full article in the comments 👇

{credit}`;

export const DEFAULT_PHOTO_COMMENT = `Full article 👉 {url}`;

export type FbShareSettings = {
  mode: ShareMode;
  captionTemplate: string;
  commentTemplate: string;
  /** Attach the news preview image to the link comment (photo mode). Default on. */
  commentImage: boolean;
  /** Domain used to build the article link that gets SHARED to Facebook — the
   *  link post itself and the link posted in the comment. Empty = use the site's
   *  own canonical URL (NEXT_PUBLIC_SITE_URL / lib/site.ts). Set this to publish
   *  under a different domain without a redeploy, e.g. after a domain move. */
  shareBaseUrl: string;
};

export const DEFAULT_FB_SHARE_SETTINGS: FbShareSettings = {
  mode: "link",
  captionTemplate: DEFAULT_PHOTO_CAPTION,
  commentTemplate: DEFAULT_PHOTO_COMMENT,
  commentImage: true,
  shareBaseUrl: "",
};

export function normalizeFbShareSettings(p: Partial<FbShareSettings> | undefined): FbShareSettings {
  const caption = typeof p?.captionTemplate === "string" && p.captionTemplate.trim() ? p.captionTemplate.slice(0, 1500) : DEFAULT_PHOTO_CAPTION;
  const comment = typeof p?.commentTemplate === "string" && p.commentTemplate.trim() ? p.commentTemplate.slice(0, 500) : DEFAULT_PHOTO_COMMENT;
  return {
    mode: isShareMode(p?.mode) ? p.mode : "link",
    captionTemplate: caption,
    commentTemplate: comment,
    commentImage: typeof p?.commentImage === "boolean" ? p.commentImage : true,
    shareBaseUrl: normalizeShareBaseUrl(p?.shareBaseUrl),
  };
}

/**
 * Clean an admin-entered share domain. Accepts "example.com" or a full URL,
 * always returns an https origin with no trailing slash (or "" to fall back to
 * the site's own canonical URL). Anything unparseable becomes "" rather than
 * silently producing broken share links.
 */
export function normalizeShareBaseUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    if (!u.hostname.includes(".")) return "";
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

/** Substitute {tokens}, then tidy blank lines left where a token resolved empty. */
export function renderTemplate(tmpl: string, vars: Record<string, string>): string {
  return tmpl
    .replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The photo credit line for a cover ("" when there's no credit to show). */
export function creditLine(coverCredit: string | null | undefined, coverImageSource: string | null | undefined): string {
  const author = (coverCredit || "").trim();
  if (!author) return "";
  const src = (coverImageSource || "").trim();
  return `Photo: ${author}${src ? ` · ${src}` : ""}`;
}

/** Render the PHOTO caption for an article (headline + excerpt + credit; the link
 *  intentionally goes in the comment, so there's NO {url} here). Client-safe — used
 *  to seed the Share-now caption box when photo mode is selected. */
export function buildPhotoCaption(
  article: { title: string; excerpt?: string | null; coverCredit?: string | null; coverImageSource?: string | null },
  template?: string,
): string {
  return renderTemplate(template || DEFAULT_PHOTO_CAPTION, {
    headline: article.title,
    excerpt: article.excerpt || "",
    credit: creditLine(article.coverCredit, article.coverImageSource),
  });
}
