// Drive the setup page the way the owner will: a real browser, real clicks.
//
// Grepping the rendered HTML cannot catch a syntax error in the inline script:
// the page renders identically either way, and the buttons simply do nothing.
// That is exactly how a stray "\n" (which a template literal turns into a real
// line break inside a JS string) shipped unnoticed. Only executing the script
// reveals it.
//
// Usage, against a server pointed at a FRESH empty database:
//   node scripts/check-setup-page.mjs http://localhost:3000
// It expects BOOTSTRAP_SECRET=testsecret123 and it WILL create tables and an
// admin account, so never point it at anything real.
import { chromium } from "playwright-core";

const base = process.argv[2];
const url = `${base}/api/admin/setup?secret=testsecret123`;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage();

const jsErrors = [];
// Only errors raised WHILE ON THE SETUP PAGE count. After step 2 the browser
// lands on /admin/login, whose blocked external fonts/scripts are a sandbox
// egress artifact and say nothing about this page.
const onSetup = () => page.url().includes("/api/admin/setup");
page.on("pageerror", (e) => { if (onSetup()) jsErrors.push(String(e)); });
page.on("console", (m) => {
  if (m.type() !== "error" || !onSetup()) return;
  // A failed subresource is not a broken handler. Keep the two apart so a
  // real exception cannot hide among missing-asset noise.
  if (/Failed to load resource/.test(m.text())) return;
  jsErrors.push("console: " + m.text());
});

page.on("response", (r) => { if (r.status() >= 400) console.log("  [http " + r.status() + "] " + r.url()); });
await page.goto(url, { waitUntil: "networkidle" });
console.log("status line:", (await page.locator("p.sub").textContent()).trim());

// Step 1 — click, then wait for the page to reload itself.
await page.locator("#b1").click();
await page.waitForFunction(
  () => document.querySelector("p.sub")?.textContent?.includes("25 tables"),
  null,
  { timeout: 60000 },
);
console.log("after step 1:", (await page.locator("p.sub").textContent()).trim());

// Step 2 — fill the form and click.
await page.locator("#em").fill("sayonkakda187@gmail.com");
await page.locator("#pw").fill("correcthorse99");
await page.locator("#b2").click();
await page.waitForURL("**/admin/login", { timeout: 30000 });
console.log("after step 2: redirected to", new URL(page.url()).pathname);

if (jsErrors.length) {
  console.error("FAIL: JavaScript errors on the page:");
  jsErrors.forEach((e) => console.error("  " + e));
  await browser.close();
  process.exit(1);
}
console.log("PASS: both buttons worked, no JavaScript errors");
await browser.close();
