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

export type AgentSettings = {
  capabilities: { newsSearch: boolean; drafting: boolean; editing: boolean; publishing: boolean; sharing: boolean };
  requireApproval: { editLive: boolean; publishing: boolean; sharing: boolean };
  customInstructions: string;
  model: string | null;
};

export const AGENT_DEFAULTS: AgentSettings = {
  capabilities: { newsSearch: true, drafting: true, editing: true, publishing: true, sharing: true },
  // publishing + sharing ship REQUIRED and are hard-enforced server-side regardless.
  requireApproval: { editLive: true, publishing: true, sharing: true },
  customInstructions: "",
  model: null,
};

export type AgentActionType = "publish_article" | "update_published_article" | "share_to_facebook";
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
