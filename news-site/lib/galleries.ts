import "server-only";

import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";

/**
 * Private image galleries — stored WITHOUT a schema change. Each gallery is one
 * JSON row in the existing `AppSetting` key-value table, keyed
 * "gallery:<token>". The token is an unguessable 32-hex-char string (128 bits)
 * that doubles as the record id AND the public URL segment (/g/<token>).
 *
 * These galleries are deliberately private: never linked from the site, marked
 * noindex, and kept out of sitemap.xml / robots.txt — so normal browsing and
 * search engines never reach them. Only someone you send the exact link to can
 * open it; a wrong/disabled/unknown token 404s.
 */

export type Gallery = {
  token: string;
  title: string;
  images: string[]; // uploaded image URLs, in display order
  enabled: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

const PREFIX = "gallery:";
const keyFor = (token: string) => PREFIX + token;
const TOKEN_RE = /^[a-f0-9]{16,64}$/i;

/** Unguessable URL token — 128 bits of entropy, hex-encoded. */
export function newGalleryToken(): string {
  return randomBytes(16).toString("hex");
}

function parse(key: string, value: string): Gallery | null {
  try {
    const o = JSON.parse(value) as Partial<Gallery>;
    const token = key.slice(PREFIX.length);
    if (!token) return null;
    return {
      token,
      title: typeof o.title === "string" ? o.title : "Untitled gallery",
      images: Array.isArray(o.images)
        ? o.images.filter((s): s is string => typeof s === "string")
        : [],
      enabled: o.enabled !== false, // default true
      createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
      updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
    };
  } catch {
    return null;
  }
}

function serialize(g: Gallery): string {
  return JSON.stringify({
    title: g.title,
    images: g.images,
    enabled: g.enabled,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  });
}

async function writeGallery(g: Gallery): Promise<Gallery> {
  const value = serialize(g);
  await prisma.appSetting.upsert({
    where: { key: keyFor(g.token) },
    update: { value, encrypted: false },
    create: { key: keyFor(g.token), value, encrypted: false },
  });
  return g;
}

/** All galleries, newest first (admin only). */
export async function listGalleries(): Promise<Gallery[]> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { startsWith: PREFIX } },
  });
  return rows
    .map((r) => parse(r.key, r.value))
    .filter((g): g is Gallery => g !== null)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** One gallery by token, or null (validates the token shape first). */
export async function getGallery(token: string): Promise<Gallery | null> {
  if (!TOKEN_RE.test(token)) return null;
  const row = await prisma.appSetting.findUnique({ where: { key: keyFor(token) } });
  if (!row?.value) return null;
  return parse(row.key, row.value);
}

export async function createGallery(title: string): Promise<Gallery> {
  const now = new Date().toISOString();
  return writeGallery({
    token: newGalleryToken(),
    title: title.trim().slice(0, 120) || "Untitled gallery",
    images: [],
    enabled: true,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateGallery(
  token: string,
  patch: Partial<Pick<Gallery, "title" | "images" | "enabled">>,
): Promise<Gallery | null> {
  const g = await getGallery(token);
  if (!g) return null;
  return writeGallery({
    ...g,
    ...(patch.title !== undefined
      ? { title: patch.title.trim().slice(0, 120) || g.title }
      : {}),
    ...(patch.images !== undefined
      ? { images: patch.images.filter((s) => typeof s === "string").slice(0, 500) }
      : {}),
    ...(patch.enabled !== undefined ? { enabled: Boolean(patch.enabled) } : {}),
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteGallery(token: string): Promise<void> {
  await prisma.appSetting.delete({ where: { key: keyFor(token) } }).catch(() => {});
}
