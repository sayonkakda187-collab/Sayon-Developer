"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Page-manager (team member) CRUD + page assignment. Managers are LOCAL app data
// (name + optional uploaded photo) — never mixed with Facebook tokens. All actions
// are admin-only. Deleting a manager unassigns it from its pages (FK SetNull) but
// never deletes pages.

type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

export async function createManager(input: { name: string; photo?: string | null }): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  const name = input.name?.trim();
  if (!name) return fail("A name is required.");
  try {
    const m = await prisma.pageManager.create({ data: { name, photo: input.photo?.trim() || null } });
    revalidatePath("/admin/page-control");
    return { ok: true, data: { id: m.id } };
  } catch {
    return fail("Couldn’t add the manager.");
  }
}

export async function updateManager(input: { id: string; name?: string; photo?: string | null }): Promise<ActionResult> {
  await requireAdmin();
  const data: { name?: string; photo?: string | null } = {};
  if (typeof input.name === "string") {
    const n = input.name.trim();
    if (!n) return fail("Name can’t be empty.");
    data.name = n;
  }
  if (input.photo !== undefined) data.photo = input.photo ? input.photo.trim() : null;
  if (Object.keys(data).length === 0) return { ok: true, data: undefined };
  try {
    await prisma.pageManager.update({ where: { id: input.id }, data });
    revalidatePath("/admin/page-control");
    return { ok: true, data: undefined };
  } catch {
    return fail("Couldn’t update the manager.");
  }
}

export async function deleteManager(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    // FK onDelete: SetNull unassigns this manager from its pages automatically.
    await prisma.pageManager.delete({ where: { id } });
    revalidatePath("/admin/page-control");
    return { ok: true, data: undefined };
  } catch {
    return fail("Couldn’t delete the manager.");
  }
}

export async function assignManager(input: { pageId: string; managerId: string | null }): Promise<ActionResult> {
  await requireAdmin();
  try {
    await prisma.monitoredPage.update({ where: { id: input.pageId }, data: { managerId: input.managerId } });
    revalidatePath("/admin/page-control");
    return { ok: true, data: undefined };
  } catch {
    return fail("Couldn’t assign the manager.");
  }
}
