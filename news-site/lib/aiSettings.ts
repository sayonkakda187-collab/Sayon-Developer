import "server-only";

import { prisma } from "@/lib/db";
import { isValidModel, DEFAULT_MODEL_ID } from "@/lib/aiModels";

// Account-wide default AI Assistant model, stored in the existing AppSetting
// table (plain, non-secret). The per-browser localStorage picker still works and
// overrides this per use; this is the cross-device default the Settings page sets
// and that a fresh browser inherits (see components/admin/AiModelSeed.tsx).

const KEY = "default_ai_model";

export async function getDefaultAiModel(): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  return isValidModel(row?.value) ? (row!.value as string) : DEFAULT_MODEL_ID;
}

export async function setDefaultAiModel(id: string): Promise<void> {
  if (!isValidModel(id)) throw new Error("Unknown model.");
  await prisma.appSetting.upsert({
    where: { key: KEY },
    update: { value: id, encrypted: false },
    create: { key: KEY, value: id, encrypted: false },
  });
}
