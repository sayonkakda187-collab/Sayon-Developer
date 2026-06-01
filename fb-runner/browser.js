// Persistent-browser controller for manual Facebook Page posting.
//
// Uses Playwright's PERSISTENT context (a real on-disk Chromium profile) so the
// login you do by hand survives restarts — you log in once, the cookies/session
// live in ./profile, and subsequent posts reuse it. One browser stays alive for
// the life of this process and is driven by command from the admin panel.
//
// IMPORTANT / HONEST CAVEATS (see README):
//  - Automating a logged-in facebook.com session is against Facebook's ToS and
//    can get the account checkpointed/disabled. Use at your own risk.
//  - Facebook's DOM changes often; the selectors below are best-effort with
//    multiple fallbacks, and every step fails LOUDLY with a clear message so the
//    admin panel can surface what broke instead of silently posting wrong.

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = process.env.FB_PROFILE_DIR || path.join(__dirname, "profile");
const NAV_TIMEOUT = 45_000;
const ACTION_TIMEOUT = 20_000;

let context = null; // Playwright BrowserContext (persistent)
let page = null; // the single working tab

/** Launch (once) the persistent browser. Headed by default so you can log in
 *  and watch what it does; set FB_HEADLESS=1 to run hidden after login works. */
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
  // If the browser is closed manually, reset so the next call relaunches.
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

/** True when a Facebook session is present (not on a login/checkpoint screen). */
export async function isLoggedIn() {
  const p = await getPage();
  try {
    await p.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });
  } catch {
    return false;
  }
  const url = p.url();
  if (/login|checkpoint|recover/i.test(url)) return false;
  // The composer / profile chrome only renders when authenticated.
  const loggedIn = await p
    .locator('[aria-label="Your profile"], [aria-label="Account"], div[role="navigation"]')
    .first()
    .isVisible()
    .catch(() => false);
  return loggedIn;
}

/** Open Facebook for a MANUAL login. Returns once the page is up; you complete
 *  login (incl. 2FA) by hand in the visible window. Session persists to disk. */
export async function openForLogin() {
  const p = await getPage();
  await p.goto("https://www.facebook.com/login", { waitUntil: "domcontentloaded" });
  return { ok: true, loggedIn: await isLoggedIn() };
}

/** List the Pages the logged-in account manages, via the "Your Pages" surface.
 *  Scrapes the Pages list page; returns [{ id?, name, url }]. Best-effort. */
export async function listPages() {
  if (!(await isLoggedIn())) throw new ManualActionError("not_logged_in", "Not logged in to Facebook. Use “Open login” first.");
  const p = await getPage();
  await p.goto("https://www.facebook.com/pages/?category=your_pages", { waitUntil: "domcontentloaded" }).catch(() => {});
  await p.waitForTimeout(2500);
  // Links to /<page>/ or profile.php pages within the "your pages" list.
  const pages = await p.evaluate(() => {
    const seen = new Map();
    for (const a of Array.from(document.querySelectorAll("a[href]"))) {
      const href = a.href || "";
      const name = (a.textContent || "").trim();
      if (!name || name.length > 80) continue;
      // Page links look like https://www.facebook.com/<slug>/ or .../profile.php?id=
      const m = href.match(/facebook\.com\/(profile\.php\?id=\d+|[A-Za-z0-9.\-]+)\/?($|\?)/);
      if (!m) continue;
      if (/\/(login|help|policies|settings|bookmarks|pages|groups|watch|marketplace|gaming)\b/i.test(href)) continue;
      const key = m[1];
      if (!seen.has(key)) seen.set(key, { id: key, name, url: `https://www.facebook.com/${key}` });
    }
    return Array.from(seen.values()).slice(0, 50);
  });
  return pages;
}

/**
 * Switch to a target Page's context and create a post. Navigates to the Page,
 * verifies we're on it, opens the composer, types the message, optionally
 * attaches one image (by absolute path or downloaded buffer the server saved),
 * and clicks Post. Throws ManualActionError with a specific `code` at each step
 * so the admin panel can show exactly what failed.
 */
export async function postToPage({ pageUrl, pageName, message, imagePath }) {
  if (!(await isLoggedIn())) throw new ManualActionError("not_logged_in", "Not logged in to Facebook.");
  if (!pageUrl) throw new ManualActionError("bad_request", "Missing target page URL.");
  if (!message || !message.trim()) throw new ManualActionError("bad_request", "Post message is empty.");
  const p = await getPage();

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

  // 2) Open the composer. Facebook shows a "Create post / What's on your mind"
  //    entry; the exact label varies, so try several.
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
      await p.waitForTimeout(3500); // let the upload/preview settle
    } catch {
      throw new ManualActionError("media_attach_failed", "Couldn't attach the image to the post.");
    }
  }

  // 5) Click Post and confirm the dialog closes (best signal of success).
  const postBtn = p.locator('div[role="dialog"]').getByRole("button", { name: /^post$/i }).first();
  try {
    await postBtn.waitFor({ state: "visible", timeout: ACTION_TIMEOUT });
    // Wait until enabled (FB disables Post until content is valid).
    await p.waitForFunction(
      (el) => el && !el.hasAttribute("aria-disabled") && el.getAttribute("aria-disabled") !== "true",
      await postBtn.elementHandle(),
      { timeout: ACTION_TIMEOUT },
    ).catch(() => {});
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
