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
};

export const DEFAULT_FB_SHARE_SETTINGS: FbShareSettings = {
  mode: "link",
  captionTemplate: DEFAULT_PHOTO_CAPTION,
  commentTemplate: DEFAULT_PHOTO_COMMENT,
};

export function normalizeFbShareSettings(p: Partial<FbShareSettings> | undefined): FbShareSettings {
  const caption = typeof p?.captionTemplate === "string" && p.captionTemplate.trim() ? p.captionTemplate.slice(0, 1500) : DEFAULT_PHOTO_CAPTION;
  const comment = typeof p?.commentTemplate === "string" && p.commentTemplate.trim() ? p.commentTemplate.slice(0, 500) : DEFAULT_PHOTO_COMMENT;
  return { mode: isShareMode(p?.mode) ? p.mode : "link", captionTemplate: caption, commentTemplate: comment };
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
