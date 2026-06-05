"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { slugify } from "@/lib/slug";
import { SITE_COOKIE } from "@/lib/sites";

// Admin-only site management. The default site is protected (can't be deleted);
// deleting a site with articles is blocked so nothing is orphaned.

/** Set which site the admin is managing (persisted in a cookie). */
export async function setActiveSite(siteId: string): Promise<{ ok: boolean }> {
  await requireAdmin();
  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
  if (!site) return { ok: false };
  cookies().set(SITE_COOKIE, siteId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/admin",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/admin", "layout");
  return { ok: true };
}

function normalizeDomain(raw?: string): string | null {
  const d = (raw ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return d || null;
}

/** Create a new (non-default) site record for the future. */
export async function createSite(input: {
  name: string;
  slug?: string;
  domain?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };
  const slug = input.slug?.trim() ? slugify(input.slug) : slugify(name);
  if (!slug) return { ok: false, error: "A valid slug is required." };
  const domain = normalizeDomain(input.domain);
  try {
    const clash = await prisma.site.findFirst({
      where: { OR: [{ slug }, ...(domain ? [{ domain }] : [])] },
      select: { slug: true, domain: true },
    });
    if (clash) {
      return { ok: false, error: clash.slug === slug ? "That slug is already taken." : "That domain is already used by another site." };
    }
    await prisma.site.create({ data: { name, slug, domain, isDefault: false } });
    revalidatePath("/admin/sites");
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t create the site." };
  }
}

/** Delete a non-default site that has no articles. */
export async function deleteSite(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const site = await prisma.site.findUnique({
    where: { id },
    select: { id: true, isDefault: true, _count: { select: { articles: true } } },
  });
  if (!site) return { ok: false, error: "Site not found." };
  if (site.isDefault) return { ok: false, error: "The default site can’t be deleted." };
  if (site._count.articles > 0) return { ok: false, error: "Move or delete this site’s articles first." };
  try {
    await prisma.site.delete({ where: { id } });
    if (cookies().get(SITE_COOKIE)?.value === id) cookies().delete(SITE_COOKIE);
    revalidatePath("/admin/sites");
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t delete the site." };
  }
}
