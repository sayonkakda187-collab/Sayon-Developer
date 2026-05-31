"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

// Server actions for the Trending News content-planning tools: per-admin saved
// ideas (bookmarks) and followed topics. Each re-checks requireAdmin. We store
// only inspiration-only fields (headline, source link, short snippet) — never a
// source's full article text.

export type SavedIdeaDTO = {
  id: string;
  title: string;
  url: string;
  source: string | null;
  image: string | null;
  snippet: string | null;
  status: string;
  savedAt: string;
};

export type FollowedTopicDTO = {
  id: string;
  topic: string;
  lang: string;
  country: string;
};

function clamp(s: unknown, max: number): string {
  return String(s ?? "").trim().slice(0, max);
}

/** Toggle a bookmark by URL: saves if absent, removes if present. */
export async function toggleSavedIdea(input: {
  title: string;
  url: string;
  source?: string;
  image?: string;
  snippet?: string;
}): Promise<{ ok: true; saved: boolean } | { ok: false; error: string }> {
  const user = await requireAdmin();
  const url = clamp(input.url, 1000);
  const title = clamp(input.title, 300);
  if (!url || !title) return { ok: false, error: "Missing story details." };

  try {
    const existing = await prisma.savedIdea.findUnique({
      where: { userId_url: { userId: user.id, url } },
      select: { id: true },
    });
    if (existing) {
      await prisma.savedIdea.delete({ where: { id: existing.id } });
      revalidatePath("/admin/trending");
      return { ok: true, saved: false };
    }
    await prisma.savedIdea.create({
      data: {
        userId: user.id,
        title,
        url,
        source: clamp(input.source, 200) || null,
        image: clamp(input.image, 1000) || null,
        snippet: clamp(input.snippet, 600) || null,
      },
    });
    revalidatePath("/admin/trending");
    return { ok: true, saved: true };
  } catch {
    return { ok: false, error: "Couldn’t update your saved ideas." };
  }
}

export async function deleteSavedIdea(id: string): Promise<{ ok: boolean }> {
  const user = await requireAdmin();
  // Scope the delete to the owner so one admin can't remove another's idea.
  await prisma.savedIdea.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/admin/trending");
  return { ok: true };
}

export async function setSavedIdeaStatus(
  id: string,
  status: "idea" | "drafting" | "done",
): Promise<{ ok: boolean }> {
  const user = await requireAdmin();
  await prisma.savedIdea.updateMany({ where: { id, userId: user.id }, data: { status } });
  revalidatePath("/admin/trending");
  return { ok: true };
}

export async function listSavedIdeas(): Promise<SavedIdeaDTO[]> {
  const user = await requireAdmin();
  const rows = await prisma.savedIdea.findMany({
    where: { userId: user.id },
    orderBy: { savedAt: "desc" },
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    source: r.source,
    image: r.image,
    snippet: r.snippet,
    status: r.status,
    savedAt: r.savedAt.toISOString(),
  }));
}

/** Add a followed topic (idempotent on [userId, topic]). */
export async function addFollowedTopic(input: {
  topic: string;
  lang?: string;
  country?: string;
}): Promise<{ ok: true; topic: FollowedTopicDTO } | { ok: false; error: string }> {
  const user = await requireAdmin();
  const topic = clamp(input.topic, 80);
  if (topic.length < 2) return { ok: false, error: "Topic is too short." };

  try {
    const row = await prisma.followedTopic.upsert({
      where: { userId_topic: { userId: user.id, topic } },
      update: { lang: clamp(input.lang, 8) || "en", country: clamp(input.country, 8) || "us" },
      create: {
        userId: user.id,
        topic,
        lang: clamp(input.lang, 8) || "en",
        country: clamp(input.country, 8) || "us",
      },
    });
    revalidatePath("/admin/trending");
    return { ok: true, topic: { id: row.id, topic: row.topic, lang: row.lang, country: row.country } };
  } catch {
    return { ok: false, error: "Couldn’t follow that topic." };
  }
}

export async function removeFollowedTopic(id: string): Promise<{ ok: boolean }> {
  const user = await requireAdmin();
  await prisma.followedTopic.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/admin/trending");
  return { ok: true };
}

export async function listFollowedTopics(): Promise<FollowedTopicDTO[]> {
  const user = await requireAdmin();
  const rows = await prisma.followedTopic.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((r) => ({ id: r.id, topic: r.topic, lang: r.lang, country: r.country }));
}
