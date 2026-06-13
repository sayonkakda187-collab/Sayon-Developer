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

// ── Tap-to-link flow: an unlinked chat picks a name from a list, then confirms with
// that manager's code. The "which manager am I linking as?" choice is held in the same
// AppSetting store (keyed separately from the page-entry pending), ~30-min TTL. Tapping
// a name NEVER links on its own — the matching code is always required. ──
const LINK_PREFIX = "earnings_link_";
const NAMES_PER_PAGE = 8;

async function setLinkPending(chatId: number, managerId: string): Promise<void> {
  const key = LINK_PREFIX + chatId;
  await prisma.appSetting
    .upsert({ where: { key }, create: { key, value: managerId, encrypted: false }, update: { value: managerId } })
    .catch(() => {});
}
async function getLinkPending(chatId: number): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: LINK_PREFIX + chatId } }).catch(() => null);
  if (!row || Date.now() - row.updatedAt.getTime() > PENDING_TTL_MS) return null;
  return row.value || null;
}
async function clearLinkPending(chatId: number): Promise<void> {
  await prisma.appSetting.delete({ where: { key: LINK_PREFIX + chatId } }).catch(() => {});
}

/** Show all manager names as tap-to-link buttons (paginated). Tapping only selects a
 *  name — the code is required next to actually link. */
async function showNameList(chatId: number, page = 0): Promise<void> {
  const managers = await prisma.pageManager.findMany({ select: { id: true, name: true, linkCode: true }, orderBy: { name: "asc" } });
  if (managers.length === 0) {
    await send(chatId, "No managers exist yet. Ask your admin to add you in the Managers tab, then tap your name here.");
    return;
  }
  const pageCount = Math.ceil(managers.length / NAMES_PER_PAGE);
  const p = Math.min(Math.max(page, 0), pageCount - 1);
  const slice = managers.slice(p * NAMES_PER_PAGE, p * NAMES_PER_PAGE + NAMES_PER_PAGE);
  const rows: InlineButton[][] = slice.map((m) => [{ text: m.name, callback_data: `lm:${m.id}` }]);
  const nav: InlineButton[] = [];
  if (p > 0) nav.push({ text: "◀ Prev", callback_data: `ln:${p - 1}` });
  if (p < pageCount - 1) nav.push({ text: "Next ▶", callback_data: `ln:${p + 1}` });
  if (nav.length) rows.push(nav);
  const header = pageCount > 1 ? `Tap your name to link (page ${p + 1}/${pageCount}):` : "Tap your name to link:";
  // Each manager's current code shown next to their name (tap-to-copy on mobile via <code>).
  const codeList = slice.map((m) => `${esc(m.name)} — <code>${esc(m.linkCode)}</code>`).join("\n");
  await send(chatId, `${header}\n\n${codeList}`, { reply_markup: { inline_keyboard: rows } });
}

/** A name was tapped — remember the choice and ask for that manager's code (the code is
 *  the secret that actually links). */
async function handleNamePick(chatId: number, managerId: string): Promise<void> {
  if (await managerByChat(chatId)) {
    await handleEarnings(chatId); // already linked — never relink, go straight to earnings
    return;
  }
  const mgr = await prisma.pageManager.findUnique({ where: { id: managerId }, select: { id: true, name: true } });
  if (!mgr) {
    await send(chatId, "That manager no longer exists — tap a name from the list.");
    await showNameList(chatId);
    return;
  }
  await setLinkPending(chatId, mgr.id);
  await send(chatId, `To link as <b>${esc(mgr.name)}</b>, send their code (from the admin Managers tab).`);
}

/** Validate a typed code against the SELECTED manager (tap-to-link). Match → link;
 *  mismatch → keep the selection so they can retry or tap a different name. */
async function tryLinkWithCode(chatId: number, managerId: string, text: string): Promise<void> {
  const mgr = await prisma.pageManager.findUnique({ where: { id: managerId }, select: { id: true, name: true, linkCode: true, telegramChatId: true } });
  if (!mgr) {
    await clearLinkPending(chatId);
    await send(chatId, "That manager no longer exists.");
    await showNameList(chatId);
    return;
  }
  if (text.trim().toUpperCase() !== mgr.linkCode.toUpperCase()) {
    await send(chatId, `❌ That code doesn't match <b>${esc(mgr.name)}</b>. Try again, or tap a different name.`);
    return; // keep the pending pick so the next message retries
  }
  if (mgr.telegramChatId && mgr.telegramChatId !== String(chatId)) {
    await clearLinkPending(chatId);
    await send(chatId, `<b>${esc(mgr.name)}</b> is already linked to another Telegram account. Ask your admin to regenerate the code ("New code").`);
    return;
  }
  await prisma.pageManager.updateMany({ where: { telegramChatId: String(chatId) }, data: { telegramChatId: null } });
  await prisma.pageManager.update({ where: { id: mgr.id }, data: { telegramChatId: String(chatId) } });
  await clearLinkPending(chatId);
  await send(chatId, `✅ Linked as <b>${esc(mgr.name)}</b>.\nSend /earnings to enter today's earnings for your pages.`);
}

function helpText(): string {
  return [
    "💰 <b>Earnings bot</b>",
    "",
    "<b>/start</b> — link your account (tap your name, then send your code)",
    "<b>/start CODE</b> — link directly with your code (e.g. <code>DARA-4827</code>)",
    "<b>/earnings</b> — enter today's earnings for your pages",
    "<b>/unlink</b> — disconnect this Telegram from your account",
    "",
    "After /earnings, tap a page then reply with the amount (e.g. <code>12.50</code>).",
  ].join("\n");
}

async function handleStart(chatId: number, arg: string): Promise<void> {
  const code = arg.trim().toUpperCase();
  if (!code) {
    const existing = await managerByChat(chatId);
    if (existing) {
      await send(chatId, `You're linked as <b>${esc(existing.name)}</b>. Send /earnings to enter today's earnings.\n<i>(send /unlink to switch accounts)</i>`);
      return;
    }
    await clearLinkPending(chatId); // fresh pick
    await send(chatId, "👋 Welcome! Link your account to enter earnings.");
    await showNameList(chatId);
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
  await clearLinkPending(chatId);
  await send(chatId, `✅ Linked as <b>${esc(mgr.name)}</b>.\nSend /earnings to enter today's earnings for your pages.`);
}

/** /unlink — disconnect ONLY the current chat from its manager. Scoped by
 *  telegramChatId, so it can never unlink anyone else; earnings already entered are
 *  kept (only the Telegram link is removed). Afterwards the chat is fresh again. */
async function handleUnlink(chatId: number): Promise<void> {
  const mgr = await managerByChat(chatId);
  if (!mgr) {
    await send(chatId, "You're not linked. Send /start to link.");
    return;
  }
  await prisma.pageManager.updateMany({ where: { telegramChatId: String(chatId) }, data: { telegramChatId: null } });
  await clearPending(chatId);
  await clearLinkPending(chatId);
  await send(chatId, `Unlinked from <b>${esc(mgr.name)}</b>. You can /start again to re-link.`);
}

async function handleEarnings(chatId: number, date?: string): Promise<void> {
  const mgr = await managerByChat(chatId);
  if (!mgr) {
    await send(chatId, "First, link your account:");
    await showNameList(chatId);
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
  const data = cb.data || "";

  // Linking taps come from UNLINKED chats — handle before the "must be linked" guard.
  const lnav = /^ln:(\d+)$/.exec(data);
  if (lnav) {
    await showNameList(chatId, parseInt(lnav[1], 10));
    return;
  }
  const lpick = /^lm:(.+)$/.exec(data);
  if (lpick) {
    await handleNamePick(chatId, lpick[1]);
    return;
  }

  const mgr = await managerByChat(chatId);
  if (!mgr) {
    await send(chatId, "You're not linked. Send /start to pick your name.");
    return;
  }
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
    // Unlinked: if they tapped a name, this text is the code; otherwise show the names.
    const pendingManagerId = await getLinkPending(chatId);
    if (pendingManagerId) await tryLinkWithCode(chatId, pendingManagerId, text);
    else await showNameList(chatId);
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
      if (cmd === "/unlink") {
        await handleUnlink(chatId);
        return;
      }
      if (cmd === "/yesterday") {
        await handleEarnings(chatId, addDays(ppToday(), -1));
        return;
      }
      if (cmd === "/cancel") {
        await clearPending(chatId);
        await clearLinkPending(chatId);
        await send(chatId, "Cancelled. Send /start to pick your name, or /earnings.");
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
