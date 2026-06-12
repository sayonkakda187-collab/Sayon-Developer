import "server-only";

import webpush from "web-push";
import { getPushSubs, removePushSub, type PushSub, type AgentActionRecord } from "./store";

// Web Push for approval alerts. VAPID keys live in env (server secret); the
// notification payload carries NOTHING sensitive beyond the action title.

let ready = false;
function ensure(): boolean {
  if (ready) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:noreply@dailyledger.today", pub, priv);
  ready = true;
  return true;
}

export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** The public VAPID key, served to the browser for PushManager.subscribe. */
export function getPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

async function sendTo(sub: PushSub, payload: Record<string, unknown>): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload),
    );
    return true;
  } catch (e) {
    const code = (e as { statusCode?: number })?.statusCode;
    // 404/410 → the subscription is gone; prune it so we don't keep trying.
    if (code === 404 || code === 410) await removePushSub(sub.endpoint).catch(() => {});
    return false;
  }
}

/** Notify every registered device that a gated action needs approval. */
export async function sendApprovalPush(action: AgentActionRecord): Promise<void> {
  if (!ensure()) return;
  const subs = await getPushSubs();
  if (subs.length === 0) return;
  const payload = {
    title: "AI Assistant: approval needed",
    body: action.summary, // e.g. "Publish: <title>" — title only, nothing sensitive
    url: "/admin/ai-assistant",
    tag: `agent-approval-${action.id}`,
  };
  await Promise.all(subs.map((s) => sendTo(s, payload)));
}

/** One push summarizing a Morning Auto-Pilot run. On success it announces the
 *  draft count and deep-links to the articles list; on failure it says the run
 *  couldn't complete. Best-effort — never throws. */
export async function sendAutopilotPush(opts: {
  ok: boolean;
  count?: number;
  message?: string;
  url?: string;
  body?: string; // explicit body (mode-aware: "published"/"scheduled"/"drafts ready")
}): Promise<void> {
  if (!ensure()) return;
  const subs = await getPushSubs();
  if (subs.length === 0) return;
  const n = opts.count ?? 0;
  const body = opts.body
    ? opts.body
    : opts.ok
      ? `${n} draft${n === 1 ? "" : "s"} ready for review`
      : opts.message || "Auto-Pilot could not run today";
  const payload = {
    title: "Auto-Pilot",
    body,
    url: opts.url || "/admin/articles",
    tag: "agent-autopilot",
  };
  await Promise.all(subs.map((s) => sendTo(s, payload)));
}

/** A confirmation push when a device first enables notifications. */
export async function sendTestPush(): Promise<number> {
  if (!ensure()) return 0;
  const subs = await getPushSubs();
  const payload = {
    title: "AI Assistant",
    body: "Notifications are on — approval alerts will arrive here.",
    url: "/admin/ai-assistant",
    tag: "agent-test",
  };
  const sent = await Promise.all(subs.map((s) => sendTo(s, payload)));
  return sent.filter(Boolean).length;
}
