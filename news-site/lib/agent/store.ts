import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { normalizePreferredTimes } from "@/lib/scheduleSlots";

// Phase-2 persistence WITHOUT a schema migration: agent settings + the action /
// approval log live as JSON in the existing AppSetting key-value table (the
// Vercel build doesn't run `migrate deploy`, so a new table wouldn't exist on the
// shared DB). Single admin → read-modify-write races are not a concern. Could be
// promoted to a dedicated table later.

const SETTINGS_KEY = "agent_settings";
const ACTIONS_KEY = "agent_actions";
const MAX_ACTIONS = 80;

// Morning Auto-Pilot: now a list of scheduled "Runs" (up to 6/day). Each Run finds
// trending stories and either DRAFTS them for approval (DEFAULT) or AUTO-PUBLISHES
// them (explicit opt-in). Times are stored as UTC "HH:MM" (shown in the admin as
// Asia/Phnom_Penh). categories = category slugs ([] = all); keyword = optional focus.
export type AutopilotRunMode = "draft" | "publish";
export type AutopilotPublishMode = "now" | "stagger";
export type AutopilotRun = {
  id: string;
  timeUtc: string; // "HH:MM" 24h UTC
  categories: string[];
  keyword: string;
  count: number; // 1-5
  mode: AutopilotRunMode; // "draft" (DEFAULT) | "publish"
  publishMode: AutopilotPublishMode; // publish-mode only: "now" | "stagger" into preferred slots
  enabled: boolean;
};

// Master switch (`enabled`) + a "pause all auto-publish" kill switch + a global
// daily cap on auto-published articles. `runs` is the new source of truth; the
// legacy single-run fields are kept so old saved settings migrate cleanly.
export type AutopilotSettings = {
  enabled: boolean;
  pauseAutoPublish: boolean;
  dailyAutoPublishCap: number;
  runs: AutopilotRun[];
  runTimeUtc: string; // legacy (seed)
  draftCount: number; // legacy (seed)
  categories: string[]; // legacy (seed)
};

export type AgentSettings = {
  capabilities: { newsSearch: boolean; drafting: boolean; editing: boolean; publishing: boolean; sharing: boolean; pageEarnings: boolean };
  requireApproval: { editLive: boolean; publishing: boolean; sharing: boolean };
  customInstructions: string;
  model: string | null;
  autopilot: AutopilotSettings;
  // Preferred publish times (Asia/Phnom_Penh "HH:mm", 24h) — the scheduling preset
  // chips + "auto-stagger" + the agent's suggestions all draw from these.
  preferredTimes: string[];
};

export const MAX_AUTOPILOT_RUNS = 6;

// 23:00 UTC == 06:00 Asia/Phnom_Penh (UTC+7, no DST) — the default run time.
export const AUTOPILOT_DEFAULTS: AutopilotSettings = {
  enabled: false,
  pauseAutoPublish: false,
  dailyAutoPublishCap: 10,
  runs: [],
  runTimeUtc: "23:00",
  draftCount: 3,
  categories: [],
};

export const AGENT_DEFAULTS: AgentSettings = {
  capabilities: { newsSearch: true, drafting: true, editing: true, publishing: true, sharing: true, pageEarnings: true },
  // publishing + sharing ship REQUIRED and are hard-enforced server-side regardless.
  requireApproval: { editLive: true, publishing: true, sharing: true },
  customInstructions: "",
  model: null,
  autopilot: AUTOPILOT_DEFAULTS,
  preferredTimes: ["19:00", "21:00", "23:00"],
};

/** Coerce a stored/partial Run into a valid AutopilotRun. New Runs default to the
 *  SAFE "draft" mode — auto-publish is always an explicit opt-in. */
export function normalizeRun(p: Partial<AutopilotRun> | undefined): AutopilotRun {
  const time = typeof p?.timeUtc === "string" && /^\d{2}:\d{2}$/.test(p.timeUtc) ? p.timeUtc : "23:00";
  const count = Number(p?.count);
  return {
    id: typeof p?.id === "string" && p.id ? p.id : randomUUID(),
    timeUtc: time,
    categories: Array.isArray(p?.categories) ? p.categories.filter((c): c is string => typeof c === "string") : [],
    keyword: typeof p?.keyword === "string" ? p.keyword.slice(0, 80) : "",
    count: Number.isFinite(count) ? Math.min(5, Math.max(1, Math.round(count))) : 3,
    mode: p?.mode === "publish" ? "publish" : "draft",
    publishMode: p?.publishMode === "now" ? "now" : "stagger",
    enabled: p?.enabled !== false,
  };
}

/** Coerce a stored/partial autopilot blob into a valid AutopilotSettings. Migrates
 *  the old single-run config into one DRAFT Run, so existing setups keep behaving
 *  exactly as before (drafts for approval). */
export function normalizeAutopilot(p: Partial<AutopilotSettings> | undefined): AutopilotSettings {
  const legacyTime = typeof p?.runTimeUtc === "string" && /^\d{2}:\d{2}$/.test(p.runTimeUtc) ? p.runTimeUtc : AUTOPILOT_DEFAULTS.runTimeUtc;
  const legacyCountRaw = Number(p?.draftCount);
  const legacyCount = Number.isFinite(legacyCountRaw) ? Math.min(5, Math.max(1, Math.round(legacyCountRaw))) : AUTOPILOT_DEFAULTS.draftCount;
  const legacyCats = Array.isArray(p?.categories) ? p.categories.filter((c): c is string => typeof c === "string") : [];

  let runs: AutopilotRun[] = Array.isArray(p?.runs) ? p.runs.slice(0, MAX_AUTOPILOT_RUNS).map((r) => normalizeRun(r)) : [];
  if (runs.length === 0) {
    // Back-compat / first run: a single DRAFT run at the legacy time.
    runs = [normalizeRun({ timeUtc: legacyTime, categories: legacyCats, count: legacyCount, mode: "draft", publishMode: "stagger", enabled: true })];
  }

  const capRaw = Number(p?.dailyAutoPublishCap);
  return {
    enabled: Boolean(p?.enabled),
    pauseAutoPublish: Boolean(p?.pauseAutoPublish),
    dailyAutoPublishCap: Number.isFinite(capRaw) ? Math.min(100, Math.max(0, Math.round(capRaw))) : AUTOPILOT_DEFAULTS.dailyAutoPublishCap,
    runs,
    runTimeUtc: legacyTime,
    draftCount: legacyCount,
    categories: legacyCats,
  };
}

export type AgentActionType =
  | "publish_article"
  | "update_published_article"
  | "share_to_facebook"
  | "set_page_earnings"
  | "autopilot_run"
  | "publish_scheduled"
  | "cron_ping";
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
      preferredTimes: normalizePreferredTimes(p.preferredTimes),
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
    preferredTimes: normalizePreferredTimes(s.preferredTimes),
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
