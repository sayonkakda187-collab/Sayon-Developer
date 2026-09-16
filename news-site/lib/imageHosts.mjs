/**
 * The image hosts next/image is allowed to load — the SINGLE source of truth.
 *
 * next.config.mjs builds its remotePatterns from this, and the server uses the
 * same list to decide whether a stored cover can actually be displayed. Keeping
 * one list means the two can never disagree; when they did, articles were saved
 * with covers the site would always refuse to render.
 *
 * Pixabay is deliberately ABSENT: its terms disallow hotlinking, which is why
 * those images are copied to Blob instead. Adding it here would "fix" broken
 * covers by breaking the licence.
 */
export const IMAGE_HOSTS = [
  "picsum.photos",
  "fastly.picsum.photos",
  "*.public.blob.vercel-storage.com",
  "images.pexels.com",
  "images.unsplash.com",
  "upload.wikimedia.org",
];

/** Does `hostname` match a pattern, honouring a single leading "*." wildcard? */
function hostMatches(hostname, pattern) {
  if (!pattern.startsWith("*.")) return hostname === pattern;
  const suffix = pattern.slice(1); // ".public.blob.vercel-storage.com"
  // Require a real label before the suffix — "*.example.com" must not match
  // "example.com" itself, which is how Next's own matcher behaves.
  return hostname.endsWith(suffix) && hostname.length > suffix.length;
}

/**
 * Can next/image actually render this URL?
 *
 * Relative paths (local uploads under /public) are fine and need no host entry.
 * Anything unparseable, non-https, or on an unlisted host will be refused by the
 * optimizer, so storing it guarantees a broken image.
 */
export function isRenderableImageUrl(url) {
  if (typeof url !== "string" || url.trim() === "") return false;
  if (url.startsWith("/")) return true; // local /public upload
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  return IMAGE_HOSTS.some((p) => hostMatches(u.hostname, p));
}
