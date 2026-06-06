"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin, clearSessionCookie } from "@/lib/auth";
import { slugify, uniqueArticleSlug } from "@/lib/slug";
import { getActiveSiteId } from "@/lib/sites";

export async function logout() {
  clearSessionCookie();
  redirect("/admin/login");
}

export async function saveArticle(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const excerpt = String(formData.get("excerpt") ?? "").trim();
  const content = String(formData.get("content") ?? "");
  const coverImage = String(formData.get("coverImage") ?? "").trim() || null;
  // Stock-photo attribution (only meaningful when a cover is set).
  const coverCredit = coverImage ? String(formData.get("coverCredit") ?? "").trim() || null : null;
  const coverCreditUrl = coverImage ? String(formData.get("coverCreditUrl") ?? "").trim() || null : null;
  const categoryId = String(formData.get("categoryId") ?? "").trim() || null;
  const status =
    String(formData.get("status") ?? "draft") === "published"
      ? "published"
      : "draft";

  if (!title) throw new Error("Title is required.");
  if (!excerpt) throw new Error("Excerpt is required.");

  // Combine selected existing tags with any newly typed (comma-separated) tags.
  const tagIds = formData.getAll("tagIds").map(String).filter(Boolean);
  const newTagNames = String(formData.get("newTags") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const name of newTagNames) {
    const slug = slugify(name);
    if (!slug) continue;
    const tag = await prisma.tag.upsert({
      where: { slug },
      update: {},
      create: { name, slug },
      select: { id: true },
    });
    tagIds.push(tag.id);
  }
  const uniqueTagIds = [...new Set(tagIds)];

  const slug = await uniqueArticleSlug(title, id || undefined);

  let savedId = id;
  if (id) {
    const existing = await prisma.article.findUnique({
      where: { id },
      select: { publishedAt: true },
    });
    const publishedAt =
      status === "published" ? (existing?.publishedAt ?? new Date()) : null;
    await prisma.article.update({
      where: { id },
      data: {
        title,
        slug,
        excerpt,
        content,
        coverImage,
        coverCredit,
        coverCreditUrl,
        categoryId,
        status,
        publishedAt,
        tags: { set: uniqueTagIds.map((tid) => ({ id: tid })) },
      },
    });
  } else {
    const publishedAt = status === "published" ? new Date() : null;
    // New articles belong to the site selected in the admin switcher (default
    // site for now). Updates never touch siteId, so existing articles stay put.
    const siteId = await getActiveSiteId();
    const created = await prisma.article.create({
      data: {
        title,
        slug,
        excerpt,
        content,
        coverImage,
        coverCredit,
        coverCreditUrl,
        categoryId,
        status,
        publishedAt,
        siteId,
        tags: { connect: uniqueTagIds.map((tid) => ({ id: tid })) },
      },
      select: { id: true },
    });
    savedId = created.id;
  }

  // On publish, land on the Articles list with the Share panel auto-opened so
  // the writer can immediately promote the story. Drafts just return to the list.
  if (status === "published") {
    redirect(`/admin/articles?published=${savedId}`);
  }
  redirect("/admin/articles");
}

export async function deleteArticle(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) await prisma.article.delete({ where: { id } });
  redirect("/admin/articles");
}

/**
 * Duplicate an article as a fresh DRAFT template: copies excerpt, body, cover,
 * category and tags, prefixes the title with "Copy of", generates a new unique
 * slug, and resets views/publishedAt. Returns the new id so the caller can open
 * it in the editor.
 */
export async function duplicateArticle(id: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireAdmin();
  if (!id) return { ok: false, error: "Missing article id." };
  const source = await prisma.article.findUnique({
    where: { id },
    include: { tags: { select: { id: true } } },
  });
  if (!source) return { ok: false, error: "Article not found." };

  const title = `Copy of ${source.title}`.slice(0, 200);
  const slug = await uniqueArticleSlug(title);
  const copy = await prisma.article.create({
    data: {
      title,
      slug,
      excerpt: source.excerpt,
      content: source.content,
      coverImage: source.coverImage,
      categoryId: source.categoryId,
      status: "draft",
      tags: { connect: source.tags.map((t) => ({ id: t.id })) },
    },
    select: { id: true },
  });
  revalidatePath("/admin/articles");
  return { ok: true, id: copy.id };
}

/**
 * Bulk operation over selected articles: publish, unpublish, or delete. Each
 * re-checks admin. Publish sets publishedAt when first published; unpublish
 * flips status to draft (keeps the row). Returns a count for the toast.
 */
export async function bulkArticleAction(
  ids: string[],
  action: "publish" | "unpublish" | "delete",
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  await requireAdmin();
  const clean = [...new Set(ids.filter(Boolean))];
  if (clean.length === 0) return { ok: false, error: "No articles selected." };

  try {
    if (action === "delete") {
      const res = await prisma.article.deleteMany({ where: { id: { in: clean } } });
      revalidatePath("/admin/articles");
      return { ok: true, count: res.count };
    }

    if (action === "unpublish") {
      const res = await prisma.article.updateMany({
        where: { id: { in: clean } },
        data: { status: "draft", publishedAt: null },
      });
      revalidatePath("/admin/articles");
      return { ok: true, count: res.count };
    }

    // publish: only flip drafts, and stamp publishedAt for those missing one.
    const toPublish = await prisma.article.findMany({
      where: { id: { in: clean } },
      select: { id: true, publishedAt: true },
    });
    const now = new Date();
    await prisma.$transaction(
      toPublish.map((a) =>
        prisma.article.update({
          where: { id: a.id },
          data: { status: "published", publishedAt: a.publishedAt ?? now },
        }),
      ),
    );
    revalidatePath("/admin/articles");
    return { ok: true, count: toPublish.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bulk action failed." };
  }
}

export async function createCategory(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!name) throw new Error("Category name is required.");
  const slug = slugify(name);
  await prisma.category.upsert({
    where: { slug },
    update: { name, description },
    create: { name, slug, description },
  });
  redirect("/admin/categories");
}

export async function deleteCategory(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) await prisma.category.delete({ where: { id } });
  redirect("/admin/categories");
}

export async function createTag(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Tag name is required.");
  const slug = slugify(name);
  await prisma.tag.upsert({
    where: { slug },
    update: { name },
    create: { name, slug },
  });
  redirect("/admin/categories");
}

export async function deleteTag(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) await prisma.tag.delete({ where: { id } });
  redirect("/admin/categories");
}

export async function approveComment(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) await prisma.comment.update({ where: { id }, data: { approved: true } });
  redirect("/admin/comments");
}

export async function unapproveComment(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) {
    await prisma.comment.update({ where: { id }, data: { approved: false } });
  }
  redirect("/admin/comments");
}

export async function deleteComment(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) await prisma.comment.delete({ where: { id } });
  redirect("/admin/comments");
}
