"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin, clearSessionCookie } from "@/lib/auth";
import { slugify, uniqueArticleSlug } from "@/lib/slug";

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
        categoryId,
        status,
        publishedAt,
        tags: { set: uniqueTagIds.map((tid) => ({ id: tid })) },
      },
    });
  } else {
    const publishedAt = status === "published" ? new Date() : null;
    await prisma.article.create({
      data: {
        title,
        slug,
        excerpt,
        content,
        coverImage,
        categoryId,
        status,
        publishedAt,
        tags: { connect: uniqueTagIds.map((tid) => ({ id: tid })) },
      },
    });
  }

  redirect("/admin/articles");
}

export async function deleteArticle(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) await prisma.article.delete({ where: { id } });
  redirect("/admin/articles");
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
