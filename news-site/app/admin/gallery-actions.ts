"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  createGallery,
  deleteGallery,
  updateGallery,
  type Gallery,
} from "@/lib/galleries";

type Result<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function createGalleryAction(title: string): Promise<Result<Gallery>> {
  await requireAdmin();
  const t = (title || "").trim();
  if (!t) return { ok: false, error: "Give the gallery a title." };
  const g = await createGallery(t);
  revalidatePath("/admin/galleries");
  return { ok: true, data: g };
}

export async function renameGalleryAction(token: string, title: string): Promise<Result> {
  await requireAdmin();
  if (!title.trim()) return { ok: false, error: "Title can't be empty." };
  const g = await updateGallery(token, { title });
  if (!g) return { ok: false, error: "Gallery not found." };
  revalidatePath("/admin/galleries");
  return { ok: true };
}

export async function setGalleryEnabledAction(token: string, enabled: boolean): Promise<Result> {
  await requireAdmin();
  const g = await updateGallery(token, { enabled });
  if (!g) return { ok: false, error: "Gallery not found." };
  revalidatePath("/admin/galleries");
  return { ok: true };
}

/** Replace the whole image list (client owns add / remove / reorder, saves here). */
export async function setGalleryImagesAction(token: string, images: string[]): Promise<Result> {
  await requireAdmin();
  if (!Array.isArray(images) || images.some((s) => typeof s !== "string")) {
    return { ok: false, error: "Invalid image list." };
  }
  const g = await updateGallery(token, { images });
  if (!g) return { ok: false, error: "Gallery not found." };
  revalidatePath("/admin/galleries");
  return { ok: true };
}

/** Replace the whole video list (client owns add / remove, saves here). Video
 *  files are uploaded browser→Blob directly via /api/admin/blob-upload; this
 *  only persists the resulting URLs on the gallery. */
export async function setGalleryVideosAction(token: string, videos: string[]): Promise<Result> {
  await requireAdmin();
  if (!Array.isArray(videos) || videos.some((s) => typeof s !== "string")) {
    return { ok: false, error: "Invalid video list." };
  }
  const g = await updateGallery(token, { videos });
  if (!g) return { ok: false, error: "Gallery not found." };
  revalidatePath("/admin/galleries");
  return { ok: true };
}

export async function deleteGalleryAction(token: string): Promise<Result> {
  await requireAdmin();
  await deleteGallery(token);
  revalidatePath("/admin/galleries");
  return { ok: true };
}
