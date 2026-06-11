import "server-only";

import { put } from "@vercel/blob";
import { searchStockPhotos, isStockConfigured, suggestQueryFromArticle } from "@/lib/stockPhotos";

// Unified, server-only featured-image search across FREE, license-clean sources:
// Pexels, Unsplash, Pixabay (all keyed) + Wikimedia Commons (keyless, always on).
// Keys are read here only — never sent to the browser. Results are cached ~1h to
// respect each source's small free rate limit. We follow each source's terms:
//   • Pexels    — hotlink CDN ok; credit appreciated (we always store + show it).
//   • Unsplash  — HOTLINK the dynamic CDN + trigger the download endpoint on use +
//                 credit photographer & Unsplash with UTM links (required).
//   • Pixabay   — hotlinking the full image is NOT allowed → we RE-HOST to Blob.
//   • Wikimedia — hotlink ok with a descriptive UA + author/license attribution.
// NEVER scrape news sites, Google Images, Pinterest, or social media.

export type ImageSourceId = "pexels" | "unsplash" | "pixabay" | "wikimedia";

export type ImageHit = {
  id: string; // `${source}:${rawId}` — unique across sources
  source: ImageSourceId;
  sourceLabel: string;
  thumb: string; // small, for the results grid
  full: string; // large landscape URL to use as the cover
  width: number;
  height: number;
  alt: string;
  author: string;
  authorUrl: string; // attribution link (UTM for Unsplash)
  pageUrl: string; // the photo's page on the source
  license?: string; // Wikimedia license short name
  downloadLocation?: string; // Unsplash only — GET on use (their requirement)
};

/** What we persist on an article once a hit is chosen. */
export type FeaturedImage = {
  url: string;
  credit: string;
  creditUrl: string;
  source: string; // human label, e.g. "Unsplash"
};

const PER_SOURCE = 6;
const MIN_WIDTH = 1200;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const UTM = "utm_source=the_daily_ledger&utm_medium=referral";
// Wikimedia asks for a descriptive User-Agent identifying the app + contact.
const WIKI_UA = "TheDailyLedger/1.0 (https://dailyledger.today; featured-image search)";

const LABELS: Record<ImageSourceId, string> = {
  pexels: "Pexels",
  unsplash: "Unsplash",
  pixabay: "Pixabay",
  wikimedia: "Wikimedia Commons",
};

export function imageSourceStatus(): Record<ImageSourceId, boolean> {
  return {
    pexels: isStockConfigured(),
    unsplash: Boolean(process.env.UNSPLASH_ACCESS_KEY),
    pixabay: Boolean(process.env.PIXABAY_API_KEY),
    wikimedia: true, // keyless — always available
  };
}

/** At least one stock source OR Wikimedia (always true) — so search always works. */
export function isImageSearchConfigured(): boolean {
  return true; // Wikimedia is keyless; stock sources enrich results when keyed
}

// ── In-memory cache (per warm instance) ───────────────────────────────────────
const cache = new Map<string, { at: number; hits: ImageHit[] }>();

function timed(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}

// ── Per-source fetchers (each defensive: any failure → []) ────────────────────

async function fetchPexelsHits(query: string): Promise<ImageHit[]> {
  if (!isStockConfigured()) return [];
  try {
    const res = await searchStockPhotos({ query, page: 1 });
    return res.photos.slice(0, PER_SOURCE).map((p) => ({
      id: `pexels:${p.id}`,
      source: "pexels" as const,
      sourceLabel: LABELS.pexels,
      thumb: p.thumb,
      full: p.full,
      width: 1880, // large2x landscape — comfortably ≥ MIN_WIDTH
      height: 1253,
      alt: p.alt,
      author: p.photographer,
      authorUrl: p.photographerUrl,
      pageUrl: p.photographerUrl,
    }));
  } catch {
    return [];
  }
}

type UnsplashPhoto = {
  id: string;
  width: number;
  height: number;
  alt_description?: string;
  description?: string;
  urls?: { raw?: string; full?: string; regular?: string; small?: string };
  links?: { html?: string; download_location?: string };
  user?: { name?: string; links?: { html?: string } };
};

async function fetchUnsplashHits(query: string): Promise<ImageHit[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return [];
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=landscape&per_page=${PER_SOURCE}&content_filter=high`;
    const res = await timed(url, { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" }, cache: "no-store" }, 6000);
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: UnsplashPhoto[] };
    return (data.results ?? [])
      .filter((p) => p.urls?.raw && p.width >= MIN_WIDTH)
      .map((p) => {
        const raw = p.urls!.raw!;
        const sized = (w: number, q: number) => `${raw}${raw.includes("?") ? "&" : "?"}w=${w}&q=${q}&fm=jpg&fit=max`;
        const author = (p.user?.name || "Unsplash photographer").trim();
        const authorHtml = p.user?.links?.html || "https://unsplash.com";
        return {
          id: `unsplash:${p.id}`,
          source: "unsplash" as const,
          sourceLabel: LABELS.unsplash,
          thumb: sized(400, 70),
          full: sized(1600, 80),
          width: p.width,
          height: p.height,
          alt: (p.alt_description || p.description || "").trim(),
          author,
          authorUrl: `${authorHtml}?${UTM}`,
          pageUrl: `${p.links?.html || "https://unsplash.com"}?${UTM}`,
          downloadLocation: p.links?.download_location,
        };
      });
  } catch {
    return [];
  }
}

type PixabayHit = {
  id: number;
  pageURL?: string;
  webformatURL?: string;
  largeImageURL?: string;
  imageWidth?: number;
  imageHeight?: number;
  tags?: string;
  user?: string;
  user_id?: number;
};

async function fetchPixabayHits(query: string): Promise<ImageHit[]> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];
  try {
    const url = `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal&safesearch=true&min_width=${MIN_WIDTH}&per_page=${PER_SOURCE}`;
    const res = await timed(url, { cache: "no-store" }, 6000);
    if (!res.ok) return [];
    const data = (await res.json()) as { hits?: PixabayHit[] };
    return (data.hits ?? [])
      .filter((h) => h.largeImageURL && (h.imageWidth ?? 0) >= MIN_WIDTH)
      .map((h) => ({
        id: `pixabay:${h.id}`,
        source: "pixabay" as const,
        sourceLabel: LABELS.pixabay,
        thumb: h.webformatURL || h.largeImageURL!,
        full: h.largeImageURL!,
        width: h.imageWidth ?? 0,
        height: h.imageHeight ?? 0,
        alt: (h.tags || "").trim(),
        author: (h.user || "Pixabay").trim(),
        authorUrl: h.user_id ? `https://pixabay.com/users/${h.user}-${h.user_id}/` : "https://pixabay.com",
        pageUrl: h.pageURL || "https://pixabay.com",
      }));
  } catch {
    return [];
  }
}

type WikiPage = {
  title?: string;
  imageinfo?: {
    url?: string;
    descriptionurl?: string;
    thumburl?: string;
    width?: number;
    height?: number;
    mime?: string;
    extmetadata?: Record<string, { value?: string }>;
  }[];
};

async function fetchWikimediaHits(query: string): Promise<ImageHit[]> {
  try {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: `filetype:bitmap ${query}`,
      gsrnamespace: "6",
      gsrlimit: String(PER_SOURCE * 2),
      prop: "imageinfo",
      iiprop: "url|size|mime|extmetadata",
      iiurlwidth: "1600", // ask for a 1600px-wide scaled thumbnail to hotlink (not the full-res original)
      iiextmetadatafilter: "Artist|LicenseShortName|Credit",
    });
    const res = await timed(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { "User-Agent": WIKI_UA, Accept: "application/json" }, cache: "no-store" }, 6000);
    if (!res.ok) return [];
    const data = (await res.json()) as { query?: { pages?: Record<string, WikiPage> } };
    const pages = Object.values(data.query?.pages ?? {});
    const out: ImageHit[] = [];
    for (const pg of pages) {
      const info = pg.imageinfo?.[0];
      if (!info?.url || !info.thumburl) continue;
      const mime = info.mime ?? "";
      if (!/^image\/(jpeg|png|webp)$/.test(mime)) continue;
      const w = info.width ?? 0;
      const h = info.height ?? 0;
      if (w < MIN_WIDTH || w <= h) continue; // landscape + large only
      const meta = info.extmetadata ?? {};
      const author = stripHtml(meta.Artist?.value ?? "") || "Unknown author";
      // Hotlink the scaled thumbnail (≤1600px), never the full-res original.
      const scaled = info.thumburl;
      const gridThumb = scaled.replace(/\/\d+px-/, "/480px-");
      out.push({
        id: `wikimedia:${pg.title ?? info.url}`,
        source: "wikimedia",
        sourceLabel: LABELS.wikimedia,
        thumb: gridThumb,
        full: scaled,
        width: w,
        height: h,
        alt: stripHtml(pg.title ?? "").replace(/^File:/, ""),
        author,
        authorUrl: info.descriptionurl ?? info.url,
        pageUrl: info.descriptionurl ?? info.url,
        license: stripHtml(meta.LicenseShortName?.value ?? "") || undefined,
      });
      if (out.length >= PER_SOURCE) break;
    }
    return out;
  } catch {
    return [];
  }
}

// ── Public search (merged + cached) ───────────────────────────────────────────

/** Interleave the per-source lists so the grid spans sources. */
function interleave(lists: ImageHit[][]): ImageHit[] {
  const out: ImageHit[] = [];
  for (let i = 0; ; i++) {
    let added = false;
    for (const l of lists) if (l[i]) { out.push(l[i]); added = true; }
    if (!added) break;
  }
  return out;
}

export async function searchImages(opts: { query: string }): Promise<{ hits: ImageHit[]; sources: Record<ImageSourceId, boolean> }> {
  const query = opts.query.trim().replace(/\s+/g, " ").slice(0, 100);
  const sources = imageSourceStatus();
  if (query.length < 2) return { hits: [], sources };

  const ckey = query.toLowerCase();
  const hit = cache.get(ckey);
  if (hit && Date.now() - hit.at < CACHE_TTL) return { hits: hit.hits, sources };

  const [pexels, unsplash, pixabay, wikimedia] = await Promise.all([
    fetchPexelsHits(query),
    fetchUnsplashHits(query),
    fetchPixabayHits(query),
    fetchWikimediaHits(query),
  ]);
  const hits = interleave([pexels, unsplash, pixabay, wikimedia]);
  cache.set(ckey, { at: Date.now(), hits });
  return { hits, sources };
}

// ── Choosing + resolving a featured image (terms-compliant per source) ────────

/** Re-host an image to Vercel Blob (used for Pixabay, whose terms disallow
 *  hotlinking). Returns the Blob URL, or null if storage isn't available. */
async function rehostToBlob(url: string): Promise<string | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  try {
    const res = await timed(url, { cache: "no-store" }, 8000);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const ext = (type.split("/")[1] || "jpg").replace("jpeg", "jpg").split("+")[0];
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > 12 * 1024 * 1024) return null; // sanity cap
    const blob = await put(`featured/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`, bytes, {
      access: "public",
      token,
      contentType: type,
    });
    return blob.url;
  } catch {
    return null;
  }
}

/** Unsplash requires a GET to the photo's download_location when it's used. */
async function triggerUnsplashDownload(loc?: string): Promise<void> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!loc || !key) return;
  try {
    await timed(`${loc}${loc.includes("?") ? "&" : "?"}client_id=${key}`, { cache: "no-store" }, 4000);
  } catch {
    /* best-effort — never block on this */
  }
}

function composeCredit(hit: ImageHit): string {
  const author = (hit.author || "Unknown").trim();
  if (hit.source === "wikimedia") return hit.license ? `${author} (${hit.license})` : author;
  return author;
}

/**
 * Turn a chosen hit into the stored FeaturedImage, honoring each source's terms:
 * Pixabay is re-hosted; Unsplash is hotlinked + its download is triggered; Pexels
 * and Wikimedia are hotlinked. Falls back to the hotlink if re-hosting fails.
 */
export async function resolveFeaturedImage(hit: ImageHit): Promise<FeaturedImage> {
  let url = hit.full;
  if (hit.source === "unsplash") {
    await triggerUnsplashDownload(hit.downloadLocation);
  } else if (hit.source === "pixabay") {
    url = (await rehostToBlob(hit.full)) ?? hit.full;
  }
  return { url, credit: composeCredit(hit), creditUrl: hit.authorUrl || hit.pageUrl || "", source: hit.sourceLabel || "Web" };
}

/**
 * Auto-pick the best featured image for an article from its title (+ category).
 * Returns the stored FeaturedImage or null (caller keeps the branded fallback).
 * Never throws — image failures must never block draft creation.
 */
export async function pickFeaturedImage(title: string, category?: string): Promise<FeaturedImage | null> {
  try {
    const base = suggestQueryFromArticle(title);
    const query = [base, category].filter(Boolean).join(" ").trim() || title.slice(0, 60);
    const { hits } = await searchImages({ query });
    if (hits.length === 0 && category) {
      // Retry without the category for a broader match.
      const broad = await searchImages({ query: base || title.slice(0, 60) });
      if (broad.hits[0]) return resolveFeaturedImage(broad.hits[0]);
    }
    if (hits.length === 0) return null;
    return await resolveFeaturedImage(hits[0]);
  } catch {
    return null;
  }
}
