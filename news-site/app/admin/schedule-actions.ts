"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { localInputToUtcISO } from "@/lib/fbSchedule";
import { scheduleArticle, publishScheduledArticleById } from "@/lib/publish";

// Server actions for the "Scheduled" queue: change time / publish now / cancel.

export async function rescheduleArticle(id: string, localPP: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const iso = localInputToUtcISO(localPP);
  if (!iso) return { ok: false, error: "Pick a valid date and time." };
  const when = new Date(iso);
  if (when.getTime() <= Date.now() + 30_000) return { ok: false, error: "Choose a time in the future." };
  const a = await prisma.article.findUnique({ where: { id }, select: { status: true } });
  if (!a) return { ok: false, error: "Article not found." };
  if (a.status === "published") return { ok: false, error: "That article is already published." };
  await scheduleArticle(id, when);
  revalidatePath("/admin/scheduled");
  return { ok: true };
}

export async function publishScheduledNow(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const res = await publishScheduledArticleById(id, { logActivity: true });
  if (!res.ok) return { ok: false, error: res.error ?? "Couldn’t publish." };
  revalidatePath("/admin/scheduled");
  return { ok: true };
}

export async function cancelScheduledArticle(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const a = await prisma.article.findUnique({ where: { id }, select: { status: true } });
  if (!a) return { ok: false, error: "Article not found." };
  if (a.status !== "scheduled") return { ok: false, error: "That article isn’t scheduled." };
  await prisma.article.update({ where: { id }, data: { status: "draft", scheduledAt: null } });
  revalidatePath("/admin/scheduled");
  revalidatePath("/admin/articles");
  return { ok: true };
}
