// Drive the import page the way the owner will: log in, paste the old
// database's connection string, tick the boxes, press the button.
//
// This caught the bug that mattered. The article-tag join table is called
// `_ArticleTags` — Prisma names an implicit many-to-many table after the
// RELATION, so `@relation("ArticleTags")` does NOT produce the `_ArticleToTag`
// that default naming suggests. The hardcoded guess copied zero rows and every
// article would have arrived untagged, silently: a table that does not exist
// reads exactly like one that is empty.
//
// Usage, against a server pointed at a throwaway target database:
//   node scripts/check-import.mjs http://localhost:3000 postgresql://.../source
// It expects admin@example.com / admin1234 and WILL write to the target.
import { chromium } from "playwright-core";

const base = process.argv[2];
const SOURCE = process.argv[3];
let failed = false;
const fail = (m) => { console.error("  FAIL: " + m); failed = true; };

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage();
page.on("pageerror", (e) => fail("JS error: " + String(e).slice(0, 120)));

await page.goto(base + "/admin/login", { waitUntil: "networkidle" });
await page.locator('input[type="email"]').first().fill("admin@example.com");
await page.locator('input[type="password"]').first().fill("admin1234");
await page.locator('button[type="submit"]').first().click();
await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 });
console.log("  logged in");

await page.goto(base + "/api/admin/import", { waitUntil: "networkidle" });
await page.locator("#url").fill(SOURCE);

// Dry run first — it must report what is on each side without moving anything.
await page.locator("#check").click();
await page.waitForFunction(() => {
  const t = document.getElementById("out")?.textContent || "";
  return t && !t.startsWith("Checking");
}, null, { timeout: 60000 });
const cmp = await page.locator("#out").textContent();
console.log("  --- check ---");
console.log(cmp.split("\n").slice(0, 6).map((l) => "  " + l).join("\n"));
if (!/Article\s+6/.test(cmp)) fail("check did not see the 6 old articles");

// Now the real move.
await page.locator("#go").click();
await page.waitForFunction(() => {
  const t = document.getElementById("out")?.textContent || "";
  return t.startsWith("Done.") || t.startsWith("Failed") || t.startsWith("Request failed");
}, null, { timeout: 120000 });
const res = await page.locator("#out").textContent();
console.log("  --- move ---");
console.log(res.split("\n").map((l) => "  " + l).join("\n"));
if (!res.startsWith("Done.")) fail("import did not finish cleanly");

await browser.close();
process.exit(failed ? 1 : 0);
