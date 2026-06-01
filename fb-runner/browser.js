// Persistent-browser controller for manual Facebook Page posting.
//
// Two modes:
//  1) INTERACTIVE LOGIN — a persistent, headed Chromium (./profile) you log into
//     by hand. We then EXPORT its session as a storageState JSON (cookies +
//     localStorage) so the admin app can back it up (encrypted) to its database.
//  2) SESSION REUSE — given a saved storageState, we spin up an EPHEMERAL context
//     already authenticated and post with it, no manual login needed. This makes
//     multi-account posting possible and keeps the runner stateless per-post.
//
// IMPORTANT / HONEST CAVEATS (see README):
//  - Automating a logged-in facebook.com session is against Facebook's ToS and
//    can get the account checkpointed/disabled. Use at your own risk.
//  - A storageState blob is a BEARER credential — whoever holds it is logged in.
//    The app encrypts it at rest; never log it here.
//  - Facebook's DOM changes often; selectors are best-effort with fallbacks, and
//    every step fails LOUDLY with a clear code so the admin panel can surface it.

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = process.env.FB_PROFILE_DIR || path.join(__dirname, "profile");
const NAV_TIMEOUT = 45_000;
const ACTION_TIMEOUT = 20_000;

let context = null; // persistent BrowserContext used for INTERACTIVE LOGIN
let page = null; // the single working tab of the login context

// ── Interactive login context (persistent, headed) ──────────────────────────

/** Launch (once) the persistent login browser. Headed by default so you can log
 *  in and watch; set FB_HEADLESS=1 to hide it after login works. */
export async function ensureBrowser() {
  if (context) return context;
  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: process.env.FB_HEADLESS === "1",
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  context.setDefaultTimeout(ACTION_TIMEOUT);
  context.setDefaultNavigationTimeout(NAV_TIMEOUT);
  page = context.pages()[0] || (await context.newPage());
  context.on("close", () => {
    context = null;
    page = null;
  });
  return context;
}

async function getPage() {
  await ensureBrowser();
  if (!page || page.isClosed()) page = await context.newPage();
  return page;
}

// ── Shared helpers ───────────────────────────────────────────────────────────

/** Navigate `p` to the FB home and report whether it's an authenticated session,
 *  plus a best-effort account display name. Works on any page (login or ephemeral). */
async function readLoginState(p) {
  try {
    await p.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });
  } catch {
    return { loggedIn: false, accountName: null };
  }
  if (/login|checkpoint|recover/i.test(p.url())) return { loggedIn: false, accountName: null };
  const loggedIn = await p
    .locator('[aria-label="Your profile"], [aria-label="Account"], div[role="navigation"]')
    .first()
    .isVisible()
    .catch(() => false);
  let accountName = null;
  if (loggedIn) {
    // Best-effort: the page <title> is usually "Facebook" but the profile shortcut
    // sometimes carries the name; try a couple of sources, fall back to null.
    accountName = await p
      .evaluate(() => {
        const cand =
          document.querySelector('[aria-label="Your profile"] [dir="auto"]')?.textContent ||
          document.querySelector('div[role="banner"] [role="navigation"] span[dir="auto"]')?.textContent ||
          null;
        const t = (cand || "").trim();
        return t && t.length <= 80 ? t : null;
      })
      .catch(() => null);
  }
  return { loggedIn, accountName };
}

/** Keep only facebook.com cookies/origins so the stored blob is minimal. */
function filterFacebook(state) {
  return {
    cookies: (state.cookies || []).filter((c) => typeof c.domain === "string" && c.domain.includes("facebook.com")),
    origins: (state.origins || []).filter((o) => typeof o.origin === "string" && o.origin.includes("facebook.com")),
  };
}

/** The actual post steps, run against a given page `p` (login OR ephemeral). */
async function doPost(p, { pageUrl, pageName, message, imagePath }) {
  // 1) Switch to the page (navigate to its profile, where the composer lives).
  try {
    await p.goto(pageUrl, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(2000);
  } catch {
    throw new ManualActionError("nav_failed", `Couldn't open the page: ${pageName || pageUrl}.`);
  }
  if (/login|checkpoint/i.test(p.url())) {
    throw new ManualActionError("not_logged_in", "Facebook redirected to login/checkpoint — re-authenticate.");
  }

  // 2) Open the composer ("Create post / What's on your mind").
  const composerEntry = p.getByRole("button", { name: /create post|what'?s on your mind|write something/i }).first();
  try {
    await composerEntry.waitFor({ state: "visible", timeout: ACTION_TIMEOUT });
    await composerEntry.click();
  } catch {
    throw new ManualActionError("composer_not_found", "Couldn't find the post composer — Facebook's layout may have changed, or you're not posting as this Page.");
  }

  // 3) Type into the composer text box (a contenteditable in the dialog).
  const box = p.locator('div[role="dialog"] div[contenteditable="true"]').first();
  try {
    await box.waitFor({ state: "visible", timeout: ACTION_TIMEOUT });
    await box.click();
    await box.type(message, { delay: 8 });
  } catch {
    throw new ManualActionError("textbox_not_found", "Couldn't type into the post box (composer dialog not found).");
  }

  // 4) Optional single image attach via the hidden file input.
  if (imagePath) {
    try {
      const fileInput = p.locator('div[role="dialog"] input[type="file"]').first();
      await fileInput.setInputFiles(imagePath, { timeout: ACTION_TIMEOUT });
      await p.waitForTimeout(3500);
    } catch {
      throw new ManualActionError("media_attach_failed", "Couldn't attach the image to the post.");
    }
  }

  // 5) Click Post and confirm the dialog closes (best signal of success).
  const postBtn = p.locator('div[role="dialog"]').getByRole("button", { name: /^post$/i }).first();
  try {
    await postBtn.waitFor({ state: "visible", timeout: ACTION_TIMEOUT });
    await p
      .waitForFunction(
        (el) => el && !el.hasAttribute("aria-disabled") && el.getAttribute("aria-disabled") !== "true",
        await postBtn.elementHandle(),
        { timeout: ACTION_TIMEOUT },
      )
      .catch(() => {});
    await postBtn.click();
  } catch {
    throw new ManualActionError("post_button_not_found", "Couldn't find/enable the Post button.");
  }

  // 6) Verify the composer dialog actually closed.
  try {
    await p.locator('div[role="dialog"] div[contenteditable="true"]').first().waitFor({ state: "hidden", timeout: ACTION_TIMEOUT });
  } catch {
    throw new ManualActionError("post_unconfirmed", "Clicked Post but couldn't confirm it published — please check the Page.");
  }

  return { ok: true, pageName: pageName || pageUrl };
}

// ── Public API ───────────────────────────────────────────────────────────────

/** True when the interactive-login context has an authenticated session. */
export async function isLoggedIn() {
  const p = await getPage();
  return (await readLoginState(p)).loggedIn;
}

/** Open Facebook for a MANUAL login in the persistent (headed) context. */
export async function openForLogin() {
  const p = await getPage();
  await p.goto("https://www.facebook.com/login", { waitUntil: "domcontentloaded" });
  return { ok: true, loggedIn: await isLoggedIn() };
}

/** Export the current interactive-login session as a (facebook-only) storageState
 *  JSON so the app can back it up. Throws if not logged in yet. */
export async function exportSession() {
  if (!context) throw new ManualActionError("no_login", "No active login. Click “Start login” first.");
  const p = await getPage();
  const { loggedIn, accountName } = await readLoginState(p);
  if (!loggedIn) throw new ManualActionError("not_logged_in", "Not logged in yet — finish login in the browser window, then capture.");
  const full = await context.storageState();
  return { state: filterFacebook(full), accountName };
}

/** Validate a saved storageState in an ephemeral headless context: is it still
 *  logged in, and what's the account name? Used for status badges / re-check. */
export async function validateSession(state) {
  if (!state) throw new ManualActionError("bad_request", "No session provided.");
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ storageState: state });
    const p = await ctx.newPage();
    return await readLoginState(p);
  } catch {
    return { loggedIn: false, accountName: null };
  } finally {
    await browser.close().catch(() => {});
  }
}

/** List the Pages the interactive-login account manages (best-effort scrape). */
export async function listPages() {
  if (!(await isLoggedIn())) throw new ManualActionError("not_logged_in", "Not logged in to Facebook. Use “Open login” first.");
  const p = await getPage();
  await p.goto("https://www.facebook.com/pages/?category=your_pages", { waitUntil: "domcontentloaded" }).catch(() => {});
  await p.waitForTimeout(2500);
  return await p.evaluate(() => {
    const seen = new Map();
    for (const a of Array.from(document.querySelectorAll("a[href]"))) {
      const href = a.href || "";
      const name = (a.textContent || "").trim();
      if (!name || name.length > 80) continue;
      const m = href.match(/facebook\.com\/(profile\.php\?id=\d+|[A-Za-z0-9.\-]+)\/?($|\?)/);
      if (!m) continue;
      if (/\/(login|help|policies|settings|bookmarks|pages|groups|watch|marketplace|gaming)\b/i.test(href)) continue;
      const key = m[1];
      if (!seen.has(key)) seen.set(key, { id: key, name, url: `https://www.facebook.com/${key}` });
    }
    return Array.from(seen.values()).slice(0, 50);
  });
}

/**
 * Create a post on a target Page. If `state` (a saved storageState) is given, use
 * an EPHEMERAL authenticated context (no manual login). Otherwise fall back to the
 * live interactive-login context. Throws ManualActionError with a specific code.
 */
export async function postToPage({ state, pageUrl, pageName, message, imagePath }) {
  if (!pageUrl) throw new ManualActionError("bad_request", "Missing target page URL.");
  if (!message || !message.trim()) throw new ManualActionError("bad_request", "Post message is empty.");

  if (state) {
    // Reuse a saved session in a throwaway context. Headless by default; set
    // FB_HEADLESS=0 to watch it for debugging.
    const browser = await chromium.launch({ headless: process.env.FB_HEADLESS !== "0" });
    try {
      const ctx = await browser.newContext({ storageState: state, viewport: { width: 1280, height: 900 } });
      ctx.setDefaultTimeout(ACTION_TIMEOUT);
      ctx.setDefaultNavigationTimeout(NAV_TIMEOUT);
      const p = await ctx.newPage();
      const ls = await readLoginState(p);
      if (!ls.loggedIn) throw new ManualActionError("session_expired", "Saved session is no longer logged in — recapture it.");
      return await doPost(p, { pageUrl, pageName, message, imagePath });
    } finally {
      await browser.close().catch(() => {});
    }
  }

  // No saved session: use the live login context (original behavior).
  if (!(await isLoggedIn())) throw new ManualActionError("not_logged_in", "Not logged in to Facebook.");
  const p = await getPage();
  return await doPost(p, { pageUrl, pageName, message, imagePath });
}

export async function shutdown() {
  if (context) {
    await context.close().catch(() => {});
    context = null;
    page = null;
  }
}

/** Typed error so the HTTP layer can return a stable `code` + message. */
export class ManualActionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ManualActionError";
    this.code = code;
  }
}
