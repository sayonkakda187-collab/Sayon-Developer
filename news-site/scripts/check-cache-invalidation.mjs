// The correctness risk of caching public reads is stale content after
// publishing: the admin hits Publish, the homepage keeps serving the old copy,
// and nothing looks broken — it just silently does not update.
//
// This proves the invalidation by publishing through the REAL admin UI and
// checking the homepage updates IMMEDIATELY, not when the revalidate window
// happens to expire.
//
// Two lessons are baked in, both learned the hard way while writing it:
//   - `excerpt` is a required field. Leaving it blank makes the browser block
//     the submit silently, which is indistinguishable from broken invalidation.
//   - Never ask the editor page whether it saved. The headline is still sitting
//     in the title input either way. Ask the public site instead.
//
// Usage, against a server on a SEEDED database (admin@example.com / admin1234):
//   node scripts/check-cache-invalidation.mjs http://localhost:3000 run1
// It publishes a real article, so point it only at a throwaway database.
import { chromium } from "playwright-core";

const base = process.argv[2];
const headline = "Invalidation Probe " + process.argv[3];
let failed = false;
const fail = (m) => { console.error("  FAIL: " + m); failed = true; };

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage();
page.on("dialog", (d) => d.accept());          // the publish guard's confirm()

// 1. Warm the homepage cache; the story must not be there yet.
if ((await (await fetch(base + "/")).text()).includes(headline)) fail("story present before publishing");
else console.log("  homepage warmed, story absent as expected");

// 2. Log in.
await page.goto(base + "/admin/login", { waitUntil: "networkidle" });
await page.locator('input[type="email"]').first().fill("admin@example.com");
await page.locator('input[type="password"]').first().fill("admin1234");
await page.locator('button[type="submit"]').first().click();
await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 });
console.log("  logged in ->", new URL(page.url()).pathname);

// 3. Write and publish through the real editor. There are TWO publish buttons
//    (inline + the phone sticky bar); only one is visible, so pick that one.
await page.goto(base + "/admin/articles/new", { waitUntil: "networkidle" });
await page.locator('input[name="title"]').first().fill(headline);
// excerpt is REQUIRED — leaving it empty makes the browser block the submit
// silently, which looks exactly like broken invalidation.
await page.locator('[name="excerpt"]').first().fill("Probe excerpt.");
await page.locator('textarea[name="content"]').first().fill("Body copy for the cache invalidation probe.");

const publish = page.locator('button[name="status"][value="published"]:visible').first();
await publish.waitFor({ state: "visible", timeout: 15000 });
await publish.click();
await page.waitForURL((u) => !u.pathname.endsWith("/new"), { timeout: 45000 });
console.log("  editor submitted ->", new URL(page.url()).pathname + new URL(page.url()).search);

// 4. Confirm it really is published before judging the homepage — otherwise a
//    silent form failure would look exactly like broken invalidation.
// Verify the row exists by fetching it directly. Reading the headline back off
// the editor page proves nothing — it is just the value still in the input.
const slug = headline.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const direct = await fetch(`${base}/news/${slug}`, { cache: "no-store" });
if (!direct.ok) fail(`the article never published (GET /news/${slug} -> ${direct.status})`);
else console.log("  article is live at /news/" + slug);

// 5. The homepage must show it NOW, from a cold fetch, with no waiting.
if (!failed) {
  const html = await (await fetch(base + "/", { cache: "no-store" })).text();
  if (html.includes(headline)) console.log("  PASS: homepage shows the new story immediately");
  else fail("homepage still serving the STALE cached copy — invalidation is broken");
}

await browser.close();
process.exit(failed ? 1 : 0);
