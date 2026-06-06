import "server-only";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

// Multi-site foundation. For now there is ONE default site (= the current site);
// this resolves the "active" site for the ADMIN (defaults to the default site)
// and provides a backward-compatible article filter. Public queries are NOT
// scoped yet (one site → unchanged behavior); domain→site routing + per-site
// branding/ads/Facebook are future work — see CLAUDE.md.

/** Stable id of the seeded default site (see the _sites migration). */
export const DEFAULT_SITE_ID = "site_default";
/** Cookie holding the admin's currently-selected site. */
export const SITE_COOKIE = "adm_site";

export type SiteLite = { id: string; name: string; slug: string; domain: string | null; isDefault: boolean };

function lite(s: { id: string; name: string; slug: string; domain: string | null; isDefault: boolean }): SiteLite {
  return { id: s.id, name: s.name, slug: s.slug, domain: s.domain, isDefault: s.isDefault };
}

/** The default site (the current live site). Falls back to the oldest site. */
export async function getDefaultSite(): Promise<SiteLite | null> {
  const s =
    (await prisma.site.findFirst({ where: { isDefault: true }, orderBy: { createdAt: "asc" } })) ??
    (await prisma.site.findFirst({ orderBy: { createdAt: "asc" } }));
  return s ? lite(s) : null;
}

/** All sites (default first) with article counts — for the Sites page + switcher.
 *  null-siteId articles count toward the default site (they're treated as default). */
export async function listSites(): Promise<(SiteLite & { articleCount: number })[]> {
  const sites = await prisma.site.findMany({ orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  if (sites.length === 0) return [];
  const counts = await prisma.article.groupBy({ by: ["siteId"], _count: { _all: true } });
  const byId = new Map<string | null, number>(counts.map((c) => [c.siteId, c._count._all]));
  const defaultId = sites.find((s) => s.isDefault)?.id;
  const nullCount = byId.get(null) ?? 0;
  return sites.map((s) => ({
    ...lite(s),
    articleCount: (byId.get(s.id) ?? 0) + (s.id === defaultId ? nullCount : 0),
  }));
}

/** The active admin site id: a validated `adm_site` cookie, else the default. */
export async function getActiveSiteId(): Promise<string> {
  const def = await getDefaultSite();
  const fallback = def?.id ?? DEFAULT_SITE_ID;
  const raw = cookies().get(SITE_COOKIE)?.value;
  if (!raw || raw === fallback) return fallback;
  const exists = await prisma.site.findUnique({ where: { id: raw }, select: { id: true } });
  return exists ? raw : fallback;
}

/** The active site as a lite record (falls back to the default site). */
export async function getActiveSite(): Promise<SiteLite | null> {
  const id = await getActiveSiteId();
  const s = await prisma.site.findUnique({ where: { id } });
  return s ? lite(s) : getDefaultSite();
}

/** Prisma `where` fragment scoping articles to a site. For the DEFAULT site we
 *  also include null-siteId rows (legacy/safety) so nothing is ever hidden. */
export function articleWhereForSite(site: { id: string; isDefault: boolean }): Record<string, unknown> {
  return site.isDefault ? { OR: [{ siteId: site.id }, { siteId: null }] } : { siteId: site.id };
}
