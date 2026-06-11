import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

// Phase-2 persistence WITHOUT a schema migration: agent settings + the action /
// approval log live as JSON in the existing AppSetting key-value table (the
// Vercel build doesn't run `migrate deploy`, so a new table wouldn't exist on the
// shared DB). Single admin → read-modify-write races are not a concern. Could be
// promoted to a dedicated table later.

const SETTINGS_KEY = "agent_settings";
const ACTIONS_KEY = "agent_actions";
const MAX_ACTIONS = 80;

// Morning Auto-Pilot: a once-daily job that drafts trending stories for review.
// Default OFF; the owner enables it. runTimeUtc is "HH:MM" 24h UTC (shown in the
// admin as Asia/Phnom_Penh). categories = category slugs to include ([] = all).
export type AutopilotSettings = {
  enabled: boolean;
  runTimeUtc: string;
  draftCount: number;
  categories: string[];
};

export type AgentSettings = {
  capabilities: { newsSearch: boolean; drafting: boolean; editing: boolean; publishing: boolean; sharing: boolean };
  requireApproval: { editLive: boolean; publishing: boolean; sharing: boolean };
  customInstructions: string;
  model: string | null;
  autopilot: AutopilotSettings;
};

// 23:00 UTC == 06:00 Asia/Phnom_Penh (UTC+7, no DST) — the default run time.
export const AUTOPILOT_DEFAULTS: AutopilotSettings = {
  enabled: false,
  runTimeUtc: "23:00",
  draftCount: 3,
  categories: [],
};

export const AGENT_DEFAULTS: AgentSettings = {
  capabilities: { newsSearch: true, drafting: true, editing: true, publishing: true, sharing: true },
  // publishing + sharing ship REQUIRED and are hard-enforced server-side regardless.
  requireApproval: { editLive: true, publishing: true, sharing: true },
  customInstructions: "",
  model: null,
  autopilot: AUTOPILOT_DEFAULTS,
};

/** Coerce a stored/partial autopilot blob into a valid AutopilotSettings. */
export function normalizeAutopilot(p: Partial<AutopilotSettings> | undefined): AutopilotSettings {
  const time = typeof p?.runTimeUtc === "string" && /^\d{2}:\d{2}$/.test(p.runTimeUtc) ? p.runTimeUtc : AUTOPILOT_DEFAULTS.runTimeUtc;
  const count = Number(p?.draftCount);
  return {
    enabled: Boolean(p?.enabled),
    runTimeUtc: time,
    draftCount: Number.isFinite(count) ? Math.min(5, Math.max(1, Math.round(count))) : AUTOPILOT_DEFAULTS.draftCount,
    categories: Array.isArray(p?.categories) ? p.categories.filter((c): c is string => typeof c === "string") : [],
  };
}

export type AgentActionType =
  | "publish_article"
  | "update_published_article"
  | "share_to_facebook"
  | "autopilot_run";
export type AgentActionStatus = "pending" | "rejected" | "done" | "failed";
export type AgentActionRecord = {
  id: string;
  type: AgentActionType;
  status: AgentActionStatus;
  summary: string; // e.g. "Publish: <title>"
  detail?: string;
  params: Record<string, unknown>;
  createdAt: string;
  decidedAt?: string;
  result?: string;
  error?: string;
};

export async function getAgentSettings(): Promise<AgentSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
  if (!row?.value) return AGENT_DEFAULTS;
  try {
    const p = JSON.parse(row.value) as Partial<AgentSettings>;
    return {
      capabilities: { ...AGENT_DEFAULTS.capabilities, ...(p.capabilities ?? {}) },
      requireApproval: { ...AGENT_DEFAULTS.requireApproval, ...(p.requireApproval ?? {}) },
      customInstructions: typeof p.customInstructions === "string" ? p.customInstructions : "",
      model: typeof p.model === "string" ? p.model : null,
      autopilot: normalizeAutopilot(p.autopilot),
    };
  } catch {
    return AGENT_DEFAULTS;
  }
}

export async function saveAgentSettings(s: AgentSettings): Promise<void> {
  // Hard-enforce: publishing + sharing always require approval, whatever the form sent.
  const safe: AgentSettings = {
    ...s,
    requireApproval: { ...s.requireApproval, publishing: true, sharing: true },
    customInstructions: (s.customInstructions ?? "").slice(0, 4000),
    autopilot: normalizeAutopilot(s.autopilot),
  };
  const value = JSON.stringify(safe);
  await prisma.appSetting.upsert({
    where: { key: SETTINGS_KEY },
    update: { value, encrypted: false },
    create: { key: SETTINGS_KEY, value, encrypted: false },
  });
}

async function readActions(): Promise<AgentActionRecord[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: ACTIONS_KEY } });
  if (!row?.value) return [];
  try {
    const arr = JSON.parse(row.value);
    return Array.isArray(arr) ? (arr as AgentActionRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeActions(list: AgentActionRecord[]): Promise<void> {
  const value = JSON.stringify(list.slice(-MAX_ACTIONS));
  await prisma.appSetting.upsert({
    where: { key: ACTIONS_KEY },
    update: { value, encrypted: false },
    create: { key: ACTIONS_KEY, value, encrypted: false },
  });
}

export async function addAction(input: {
  type: AgentActionType;
  status: AgentActionStatus;
  summary: string;
  detail?: string;
  params: Record<string, unknown>;
}): Promise<AgentActionRecord> {
  const rec: AgentActionRecord = { id: randomUUID(), createdAt: new Date().toISOString(), ...input };
  const list = await readActions();
  list.push(rec);
  await writeActions(list);
  return rec;
}

export async function getAction(id: string): Promise<AgentActionRecord | null> {
  const list = await readActions();
  return list.find((a) => a.id === id) ?? null;
}

export async function updateAction(
  id: string,
  patch: Partial<AgentActionRecord>,
): Promise<AgentActionRecord | null> {
  const list = await readActions();
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch };
  await writeActions(list);
  return list[idx];
}

/** Most-recent-first, capped. For the activity log + pending cards. */
export async function listActions(limit = 30): Promise<AgentActionRecord[]> {
  const list = await readActions();
  return list.slice(-limit).reverse();
}

// ── Web Push subscriptions (the admin's installed phones) ─────────────────────
const PUSH_KEY = "agent_push_subs";

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function getPushSubs(): Promise<PushSub[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: PUSH_KEY } });
  if (!row?.value) return [];
  try {
    const arr = JSON.parse(row.value);
    return Array.isArray(arr) ? (arr as PushSub[]) : [];
  } catch {
    return [];
  }
}

async function writePushSubs(list: PushSub[]): Promise<void> {
  const value = JSON.stringify(list.slice(-20));
  await prisma.appSetting.upsert({
    where: { key: PUSH_KEY },
    update: { value, encrypted: false },
    create: { key: PUSH_KEY, value, encrypted: false },
  });
}

export async function addPushSub(sub: PushSub): Promise<void> {
  const list = (await getPushSubs()).filter((s) => s.endpoint !== sub.endpoint);
  list.push(sub);
  await writePushSubs(list);
}

export async function removePushSub(endpoint: string): Promise<void> {
  const list = (await getPushSubs()).filter((s) => s.endpoint !== endpoint);
  await writePushSubs(list);
}
