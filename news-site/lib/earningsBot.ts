import { prisma } from "@/lib/db";
import { ppToday, addDays, formatDay } from "@/lib/fbInsightsRange";

// ── The earnings Telegram bot (a SEPARATE bot — its own token) ───────────────
// Managers link their chat with `/start <CODE>` (the code the admin shows in the
// Managers tab), then `/earnings` lists ONLY their assigned pages for a day as tap
// buttons; tapping a page and replying with a number upserts that (page, day)'s
// earnings. Every action is scoped by telegramChatId → managerId → that manager's
// pages, so a manager can only ever see/enter their own. Webhook-driven; the token
// (EARNINGS_TELEGRAM_BOT_TOKEN) lives only on the server.

const TG_API = "https://api.telegram.org";

type TgChat = { id: number };
type TgMessage = { message_id: number; chat?: TgChat; text?: string };
type TgCallbackQuery = { id: string; data?: string; message?: TgMessage };
type TgUpdate = { message?: TgMessage; callback_query?: TgCallbackQuery };
type InlineButton = { text: string; callback_data: string };

function botToken(): string | null {
  return process.env.EARNINGS_TELEGRAM_BOT_TOKEN || null;
}

/** Whether the bot token is configured (used by the admin status/setup route). */
export function earningsBotConfigured(): boolean {
  return !!botToken();
}

async function tg(method: string, body: Record<string, unknown>): Promise<{ ok?: boolean; description?: string; result?: unknown } | null> {
  const token = botToken();
  if (!token) return null;
  try {
    const res = await fetch(`${TG_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json().catch(() => null)) as { ok?: boolean } | null;
  } catch {
    return null; // never throw out of a handler — Telegram will retry the webhook
  }
}

function send(chatId: number | string, text: string, extra?: Record<string, unknown>): Promise<unknown> {
  return tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
}

/** Escape user-supplied text for Telegram HTML parse mode. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Parse a manager's reply into a non-negative amount (≤ 2dp), or null if invalid. */
function parseAmount(text: string): number | null {
  const cleaned = text.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) return null;
  return Math.round(n * 100) / 100;
}

function dayLabel(day: string): string {
  const today = ppToday();
  if (day === today) return `today (${formatDay(day)})`;
  if (day === addDays(today, -1)) return `yesterday (${formatDay(day)})`;
  return formatDay(day);
}

// ── Pending "which page am I entering?" state — one per chat, ~30-min TTL. Kept
// in AppSetting (key/value) so it survives across stateless webhook invocations. ──
const PENDING_PREFIX = "earnings_pending_";
const PENDING_TTL_MS = 30 * 60 * 1000;

async function setPending(chatId: number, data: { pageId: string; date: string }): Promise<void> {
  const key = PENDING_PREFIX + chatId;
  await prisma.appSetting
    .upsert({ where: { key }, create: { key, value: JSON.stringify(data), encrypted: false }, update: { value: JSON.stringify(data) } })
    .catch(() => {});
}
async function getPending(chatId: number): Promise<{ pageId: string; date: string } | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: PENDING_PREFIX + chatId } }).catch(() => null);
  if (!row || Date.now() - row.updatedAt.getTime() > PENDING_TTL_MS) return null;
  try {
    return JSON.parse(row.value) as { pageId: string; date: string };
  } catch {
    return null;
  }
}
async function clearPending(chatId: number): Promise<void> {
  await prisma.appSetting.delete({ where: { key: PENDING_PREFIX + chatId } }).catch(() => {});
}

function managerByChat(chatId: number) {
  return prisma.pageManager.findUnique({ where: { telegramChatId: String(chatId) }, select: { id: true, name: true } });
}

function helpText(): string {
  return [
    "💰 <b>Earnings bot</b>",
    "",
    "<b>/start CODE</b> — link your account (the code your admin gave you, e.g. <code>DARA-4827</code>)",
    "<b>/earnings</b> — enter today's earnings for your pages",
    "",
    "After /earnings, tap a page then reply with the amount (e.g. <code>12.50</code>).",
  ].join("\n");
}

async function handleStart(chatId: number, arg: string): Promise<void> {
  const code = arg.trim().toUpperCase();
  if (!code) {
    const existing = await managerByChat(chatId);
    if (existing) await send(chatId, `You're linked as <b>${esc(existing.name)}</b>. Send /earnings to enter today's earnings.`);
    else await send(chatId, "👋 Welcome! Send <code>/start YOUR-CODE</code> with the link code your admin gave you (e.g. <code>DARA-4827</code>).");
    return;
  }
  const mgr = await prisma.pageManager.findUnique({ where: { linkCode: code }, select: { id: true, name: true, telegramChatId: true } });
  if (!mgr) {
    await send(chatId, "❌ That code wasn't recognised. Double-check it with your admin, then send <code>/start CODE</code> again.");
    return;
  }
  if (mgr.telegramChatId === String(chatId)) {
    await send(chatId, `You're already linked as <b>${esc(mgr.name)}</b>. Send /earnings.`);
    return;
  }
  if (mgr.telegramChatId) {
    await send(chatId, '❌ That code is already linked to another Telegram account. Ask your admin to regenerate it ("New code").');
    return;
  }
  // Attach this chat — first detach it from any other manager (telegramChatId is unique).
  await prisma.pageManager.updateMany({ where: { telegramChatId: String(chatId) }, data: { telegramChatId: null } });
  await prisma.pageManager.update({ where: { id: mgr.id }, data: { telegramChatId: String(chatId) } });
  await send(chatId, `✅ Linked as <b>${esc(mgr.name)}</b>.\nSend /earnings to enter today's earnings for your pages.`);
}

async function handleEarnings(chatId: number, date?: string): Promise<void> {
  const mgr = await managerByChat(chatId);
  if (!mgr) {
    await send(chatId, "You're not linked yet. Send <code>/start YOUR-CODE</code> with the code your admin gave you.");
    return;
  }
  await clearPending(chatId); // showing the list resets any half-finished entry
  const today = ppToday();
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  const pages = await prisma.monitoredPage.findMany({ where: { managerId: mgr.id }, select: { id: true, pageName: true }, orderBy: { pageName: "asc" } });
  if (pages.length === 0) {
    await send(chatId, "You don't have any pages assigned yet. Ask your admin to assign Pages to you, then send /earnings.");
    return;
  }
  const earnings = await prisma.pageEarning.findMany({ where: { monitoredPageId: { in: pages.map((p) => p.id) }, date: day }, select: { monitoredPageId: true, amount: true } });
  const byPage = new Map(earnings.map((e) => [e.monitoredPageId, Number(e.amount)]));
  const rows: InlineButton[][] = pages.map((p) => {
    const v = byPage.get(p.id);
    return [{ text: v != null ? `${p.pageName} · ${money(v)}` : `${p.pageName} · not set`, callback_data: `e:${p.id}:${day}` }];
  });
  // Optional day nav — today ⇄ yesterday only (the core stays "today").
  const yest = addDays(today, -1);
  if (day === today) rows.push([{ text: "◀ Yesterday", callback_data: `g:${yest}` }]);
  else if (day === yest) rows.push([{ text: "Today ▶", callback_data: `g:${today}` }]);

  const total = [...byPage.values()].reduce((s, v) => s + v, 0);
  const lines = [`<b>Earnings — ${dayLabel(day)}</b>`, "Tap a page to set its amount."];
  if (byPage.size > 0) lines.push(`Entered so far: <b>${money(total)}</b> across ${byPage.size}/${pages.length} ${pages.length === 1 ? "page" : "pages"}.`);
  await send(chatId, lines.join("\n"), { reply_markup: { inline_keyboard: rows } });
}

async function handleCallback(cb: TgCallbackQuery): Promise<void> {
  await tg("answerCallbackQuery", { callback_query_id: cb.id });
  const chatId = cb.message?.chat?.id;
  if (chatId == null) return;
  const mgr = await managerByChat(chatId);
  if (!mgr) {
    await send(chatId, "You're not linked. Send <code>/start YOUR-CODE</code>.");
    return;
  }
  const data = cb.data || "";
  const nav = /^g:(\d{4}-\d{2}-\d{2})$/.exec(data);
  if (nav) {
    await handleEarnings(chatId, nav[1]);
    return;
  }
  const pick = /^e:(.+):(\d{4}-\d{2}-\d{2})$/.exec(data);
  if (!pick) return;
  const [, pageId, day] = pick;
  const page = await prisma.monitoredPage.findFirst({ where: { id: pageId, managerId: mgr.id }, select: { id: true, pageName: true } });
  if (!page) {
    await send(chatId, "That page isn't assigned to you.");
    return;
  }
  await setPending(chatId, { pageId: page.id, date: day });
  await send(chatId, `How much did <b>${esc(page.pageName)}</b> earn ${dayLabel(day)}?\nReply with a number (e.g. <code>12.50</code>).`, { reply_markup: { force_reply: true } });
}

async function handleAmount(chatId: number, text: string): Promise<void> {
  const mgr = await managerByChat(chatId);
  if (!mgr) {
    await send(chatId, "You're not linked yet. Send <code>/start YOUR-CODE</code>.");
    return;
  }
  const pending = await getPending(chatId);
  if (!pending) {
    await send(chatId, "Send /earnings, then tap a page to set its amount.");
    return;
  }
  const amount = parseAmount(text);
  if (amount == null) {
    await send(chatId, "Please reply with a number ≥ 0 — e.g. <code>12.50</code>.");
    return;
  }
  // Re-check ownership at write time (assignment could have changed).
  const page = await prisma.monitoredPage.findFirst({ where: { id: pending.pageId, managerId: mgr.id }, select: { id: true, pageName: true } });
  if (!page) {
    await clearPending(chatId);
    await send(chatId, "That page isn't assigned to you anymore. Send /earnings.");
    return;
  }
  await prisma.pageEarning.upsert({
    where: { monitoredPageId_date: { monitoredPageId: page.id, date: pending.date } },
    create: { monitoredPageId: page.id, date: pending.date, amount, currency: "USD", enteredByManagerId: mgr.id },
    update: { amount, enteredByManagerId: mgr.id },
  });
  await clearPending(chatId);
  const pageIds = (await prisma.monitoredPage.findMany({ where: { managerId: mgr.id }, select: { id: true } })).map((p) => p.id);
  const dayEarnings = await prisma.pageEarning.findMany({ where: { monitoredPageId: { in: pageIds }, date: pending.date }, select: { amount: true } });
  const total = dayEarnings.reduce((s, e) => s + Number(e.amount), 0);
  await send(chatId, `✅ Saved <b>${esc(page.pageName)}</b> = <b>${money(amount)}</b> for ${dayLabel(pending.date)}.\nYour ${dayLabel(pending.date)} total: <b>${money(total)}</b>.\n\nSend /earnings to enter another.`);
}

/** Entry point — dispatch one Telegram update. Always resolves (never throws) so the
 *  webhook returns 200 and Telegram doesn't spam retries. */
export async function handleEarningsUpdate(raw: unknown): Promise<void> {
  const update = (raw ?? {}) as TgUpdate;
  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return;
    }
    const msg = update.message;
    const chatId = msg?.chat?.id;
    if (chatId == null) return;
    const text = (msg?.text || "").trim();
    if (!text) return;
    if (text.startsWith("/")) {
      const cmd = text.split(/\s+/)[0].split("@")[0].toLowerCase();
      const arg = text.slice(text.split(/\s+/)[0].length).trim();
      if (cmd === "/start") {
        await handleStart(chatId, arg);
        return;
      }
      if (cmd === "/earnings") {
        await handleEarnings(chatId);
        return;
      }
      if (cmd === "/yesterday") {
        await handleEarnings(chatId, addDays(ppToday(), -1));
        return;
      }
      if (cmd === "/cancel") {
        await clearPending(chatId);
        await send(chatId, "Cancelled. Send /earnings to start again.");
        return;
      }
      await send(chatId, helpText());
      return;
    }
    await handleAmount(chatId, text);
  } catch {
    // swallow — the webhook always returns 200
  }
}

// ── Webhook registration (used by the admin setup route) ─────────────────────
export async function setEarningsWebhook(url: string, secret: string | null): Promise<{ ok: boolean; description?: string }> {
  const res = await tg("setWebhook", { url, secret_token: secret || undefined, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
  return { ok: !!res?.ok, description: res?.description };
}

export async function getEarningsWebhookInfo(): Promise<unknown> {
  const res = await tg("getWebhookInfo", {});
  return res?.result ?? null;
}
