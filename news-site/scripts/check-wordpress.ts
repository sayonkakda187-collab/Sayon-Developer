import { describeError, normalizeBaseUrl, plain } from "../lib/wordpress/format";
import { markdownToHtml } from "../lib/wordpress/markdown";
import { draftToEditorFields, trendingToItems } from "../lib/wordpress/compose";

let pass = 0, fail = 0;
const is = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓ " + m)) : (fail++, console.log("  ✗ " + m)); };
const eq = (a: unknown, b: unknown, m: string) =>
  is(a === b, `${m}${a === b ? "" : `  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);

console.log("\n=== normalizeBaseUrl: accepts what people actually paste ===");
eq(normalizeBaseUrl("https://example.com"), "https://example.com", "plain https URL");
eq(normalizeBaseUrl("https://example.com/"), "https://example.com", "strips a trailing slash");
eq(normalizeBaseUrl("example.com"), "https://example.com", "assumes https for a bare domain");
eq(normalizeBaseUrl("  example.com  "), "https://example.com", "trims surrounding space");
eq(normalizeBaseUrl("http://localhost:8080"), "http://localhost:8080", "keeps http and a port");
eq(normalizeBaseUrl("https://example.com/blog"), "https://example.com/blog", "keeps a subdirectory install");
eq(normalizeBaseUrl("https://example.com/blog/"), "https://example.com/blog", "strips the slash after a subdirectory");

console.log("\n=== normalizeBaseUrl: tolerates the endpoint being pasted ===");
eq(normalizeBaseUrl("https://example.com/wp-json"), "https://example.com", "strips /wp-json");
eq(normalizeBaseUrl("https://example.com/wp-json/"), "https://example.com", "strips /wp-json/");
eq(normalizeBaseUrl("https://example.com/wp-json/wp/v2/posts"), "https://example.com",
   "strips the full endpoint path");
eq(normalizeBaseUrl("https://example.com/blog/wp-json/wp/v2/posts"), "https://example.com/blog",
   "strips the endpoint but keeps the subdirectory");

console.log("\n=== normalizeBaseUrl: rejects what must not become a request ===");
eq(normalizeBaseUrl(""), null, "empty");
eq(normalizeBaseUrl("   "), null, "whitespace only");
eq(normalizeBaseUrl("file:///etc/passwd"), null, "file: scheme");
eq(normalizeBaseUrl("ftp://example.com"), null, "ftp: scheme");
eq(normalizeBaseUrl("javascript:alert(1)"), null, "javascript: scheme");
eq(normalizeBaseUrl("not a url at all"), null, "free text with spaces");
// Regression: a scheme-less value gets https prepended, which must not be a way
// to smuggle a different scheme past the check.
eq(normalizeBaseUrl("data:text/html,x"), null, "data: scheme is not treated as a hostname");

console.log("\n=== describeError: 401 and 403 give DIFFERENT advice ===");
{
  const unauth = describeError(401, { code: "rest_not_logged_in", message: "Not logged in." }, "https://x.test");
  const forbid = describeError(403, { code: "rest_cannot_create", message: "Sorry, you are not allowed." }, "https://x.test");
  is(unauth.kind === "unauthorized", "401 → unauthorized");
  is(forbid.kind === "forbidden", "403 → forbidden");
  is(unauth.message !== forbid.message, "the two do not share a message");
  is(/login name/i.test(unauth.message), "401 points at the username/app password");
  is(/Authorization header/i.test(unauth.message), "401 mentions the stripped-header case");
  is(/capabilit|role/i.test(forbid.message), "403 points at the role, not the password");
  is(unauth.message.includes("Not logged in."), "401 still relays WordPress's own message");
  is(unauth.code === "rest_not_logged_in" && forbid.code === "rest_cannot_create", "both keep WP's error code");
}

console.log("\n=== describeError: the rest of the statuses ===");
{
  // Deliberately NOT `status`: WordPress uses that one to report an auth
  // failure, so it is special-cased below.
  const bad = describeError(400, { code: "rest_invalid_param", message: "Invalid parameter(s): slug" }, null);
  is(bad.kind === "invalid", "400 → invalid");
  is(bad.message === "Invalid parameter(s): slug", "400 surfaces WordPress's message verbatim");

  const missing = describeError(404, null, "https://x.test");
  is(missing.kind === "not_found", "404 → not_found");
  is(missing.message.includes("https://x.test"), "404 names the site it could not find it on");
  is(/REST API is disabled/i.test(missing.message), "404 raises the disabled-REST case");

  is(describeError(429, null, null).kind === "rate_limited", "429 → rate_limited");
  is(describeError(500, null, null).kind === "server", "500 → server");
  is(describeError(503, null, null).kind === "server", "503 → server");
  is(describeError(418, null, null).kind === "invalid", "an unexpected 4xx falls back to invalid");
  is(describeError(400, null, null).message.includes("400"),
     "a 400 with no body still names the status");
  is(describeError(500, { message: "db down" }, null).message.includes("db down"), "5xx relays WP's message");
}

console.log("\n=== describeError: WordPress's misleading status error ===");
{
  // Unauthenticated, WordPress refuses to list drafts via the `status`
  // sanitiser, which runs during request VALIDATION — so it comes back as
  // rest_invalid_param (400), not 401/403. Relaying that verbatim sends people
  // hunting for a bad parameter.
  const wrapped = describeError(400, {
    code: "rest_invalid_param",
    message: "Invalid parameter(s): status",
    data: { params: { status: "Status is forbidden." } },
  }, "https://x.test");
  is(wrapped.kind === "unauthorized", "a status rest_invalid_param is reported as an auth problem");
  is(/not authenticated|cannot edit posts/i.test(wrapped.message), "and says so plainly");
  is(/Test connection/i.test(wrapped.message), "and points at the button that actually diagnoses it");
  is(wrapped.message.includes("Status is forbidden."), "while still relaying WordPress's own detail");

  // Without the params detail, the message text alone is enough to recognise it.
  const textOnly = describeError(400, { code: "rest_invalid_param", message: "Invalid parameter(s): status" }, null);
  is(textOnly.kind === "unauthorized", "recognised from the message when no params detail is sent");

  // A DIFFERENT invalid parameter must not be mislabelled as an auth failure.
  const other = describeError(400, {
    code: "rest_invalid_param", message: "Invalid parameter(s): featured_media",
    data: { params: { featured_media: "Invalid media ID." } },
  }, null);
  is(other.kind === "invalid", "an unrelated invalid parameter stays 'invalid'");
  is(other.message.includes("featured_media"), "and still names the field WordPress rejected");
}

console.log("\n=== describeError never leaks credentials ===");
{
  // A body echoing something sensitive must not widen what we print: only
  // WordPress's own `message` is relayed, and only where stated.
  const e = describeError(401, { code: "c", message: "bad auth" }, "https://x.test");
  is(!/WP_APPLICATION_PASSWORD=|Basic [A-Za-z0-9+/=]{8,}/.test(e.message),
     "no Authorization header or password value in the message");
}

console.log("\n=== plain: rendered titles become text ===");
eq(plain("<b>Hello</b> world"), "Hello world", "strips tags");
eq(plain("Ben &amp; Jerry&#8217;s"), "Ben & Jerry’s", "decodes named and numeric entities");
eq(plain("&#x2018;quoted&#x2019;"), "‘quoted’", "decodes hex entities");
eq(plain("&amp;lt;script&amp;gt;"), "&lt;script&gt;",
   "decodes &amp; LAST, so double-escaped markup does not become a tag");
eq(plain("  spaced  "), "spaced", "trims");
eq(plain(""), "", "empty input");

console.log("\n=== draftToEditorFields: what lands in the editor ===");
{
  const r = draftToEditorFields({
    headlines: ["A Clear Headline", "Another Option"],
    draft: "## Section\n\nBody text.",
    excerpt: "A short summary.",
    brief: "What the story is.",
  }, "Original wire headline");
  eq(r.title, "A Clear Headline", "title takes the first suggested headline");
  eq(r.content, "## Section\n\nBody text.", "content is the draft, unchanged");
  eq(r.excerpt, "A short summary.", "excerpt carries over");
  eq(r.headlines.length, 2, "all suggestions are kept so another can be picked");
}
{
  // The model is told not to, but sometimes labels or quotes its headlines.
  const r = draftToEditorFields({ headlines: ['Headline: "The Real Title"'], draft: "x" }, "");
  eq(r.title, "The Real Title", "a 'Headline:' prefix and wrapping quotes are stripped");
  eq(draftToEditorFields({ headlines: ["  Title — Spaced   Out  "], draft: "x" }, "").title,
     "Title — Spaced Out", "internal whitespace is collapsed and ends trimmed");
  eq(draftToEditorFields({ headlines: ["\u201cCurly quoted\u201d"], draft: "x" }, "").title,
     "Curly quoted", "curly quotes are stripped too");
}
{
  const r = draftToEditorFields({ headlines: ["Same One", "same one", "Different"], draft: "x" }, "");
  eq(r.headlines.length, 2, "case-insensitive duplicates are dropped");
  eq(r.headlines[0], "Same One", "the first spelling offered is the one kept");
}
console.log("\n=== draftToEditorFields: never leaves the title empty ===");
{
  // A generation that produced a body but no usable headline must still be
  // usable — otherwise the editor silently ends up with content and no title.
  eq(draftToEditorFields({ headlines: [], draft: "Body." }, "The source headline").title,
     "The source headline", "falls back to the headline it was asked to write about");
  eq(draftToEditorFields({ headlines: ["", "   "], draft: "Body." }, "Fallback").title,
     "Fallback", "blank suggestions do not count as a headline");
  eq(draftToEditorFields(null, "Fallback").title, "Fallback", "a null result still yields the fallback");
  eq(draftToEditorFields(null, "").title, "", "no result and no fallback is empty, not a crash");
  eq(draftToEditorFields({ draft: "  spaced  " }, "").content, "spaced", "content is trimmed");
}

console.log("\n=== trendingToItems: only rows the picker can use ===");
{
  const items = trendingToItems([
    { title: " Real story ", description: " desc ", source: " Reuters ", url: "https://a.test/1", image: null, publishedAt: "2026-09-01T00:00:00Z", via: "gnews" },
    { title: "", description: "", source: "X", url: "https://a.test/2", image: null, publishedAt: null, via: "gnews" },
    { title: "No url", description: "", source: "X", url: "", image: null, publishedAt: null, via: "gnews" },
  ] as never);
  eq(items.length, 1, "rows without a title or url are dropped");
  eq(items[0].title, "Real story", "title trimmed");
  eq(items[0].source, "Reuters", "source trimmed");
  eq(items[0].publishedAt, "2026-09-01T00:00:00Z", "timestamp preserved");
  // The card layout needs both of these; dropping them is what made the first
  // version render as a plain list instead of matching the Trending News tab.
  eq(items[0].image, null, "a missing image stays null rather than undefined");
  eq(items[0].via, "gnews", "the provenance tag is carried through for the badge");
  {
    const withImage = trendingToItems([
      { title: "Has art", description: "d", source: "AP", url: "https://a.test/3",
        image: "https://img.test/a.jpg", publishedAt: null, via: "newsdata" },
    ] as never);
    eq(withImage[0].image, "https://img.test/a.jpg", "a cover image is carried through");
    eq(withImage[0].via, "newsdata", "the source API is carried through");
  }
  eq(trendingToItems(null).length, 0, "null feed is an empty list, not a crash");
  eq(trendingToItems([]).length, 0, "empty feed stays empty");
}

async function markdownChecks() {
  console.log("\n=== markdownToHtml: the point of it ===");
  {
    // The bug this exists to prevent: Markdown posted straight to WordPress
    // publishes as literal asterisks and hashes.
    const html = await markdownToHtml("## Heading\n\nSome **bold** and _italic_ text.");
    is(html.includes("<h2>Heading</h2>"), "heading becomes <h2>");
    is(html.includes("<strong>bold</strong>"), "** becomes <strong>");
    is(html.includes("<em>italic</em>"), "_ becomes <em>");
    is(!/\*\*/.test(html) && !/^##/m.test(html), "no literal Markdown syntax survives");
  }

  console.log("\n=== markdownToHtml: GFM, same as the public renderer ===");
  {
    const table = await markdownToHtml("| a | b |\n|---|---|\n| 1 | 2 |");
    is(table.includes("<table>") && table.includes("<td>1</td>"), "GFM tables render");
    is((await markdownToHtml("~~gone~~")).includes("<del>gone</del>"), "strikethrough renders");
    is((await markdownToHtml("- [x] done\n- [ ] todo")).includes('type="checkbox"'), "task lists render");
    is((await markdownToHtml("See https://example.com for more.")).includes('<a href="https://example.com"'),
       "bare URLs autolink");
  }

  console.log("\n=== markdownToHtml: structure that must survive ===");
  {
    const code = await markdownToHtml("```js\nconst a = 1;\n```");
    is(code.includes("<pre>") && code.includes("const a = 1;"), "fenced code becomes <pre>");
    is(code.includes("language-js"), "the code fence language is kept");
    const list = await markdownToHtml("- one\n- two");
    is(list.includes("<ul>") && (list.match(/<li>/g) || []).length === 2, "lists render with both items");
    is((await markdownToHtml("[text](https://example.com)")).includes('href="https://example.com"'), "links render");
    const img = await markdownToHtml("![alt](https://example.com/a.png)");
    is(img.includes('<img src="https://example.com/a.png"') && img.includes('alt="alt"'), "images render");
    is((await markdownToHtml("> quoted")).includes("<blockquote>"), "blockquotes render");
  }

  console.log("\n=== markdownToHtml: raw HTML passes through ===");
  {
    // Deliberate: Markdown routinely carries embeds, and silently dropping them
    // would be worse than useless. WordPress applies its own wp_kses on arrival.
    const embed = await markdownToHtml('Before\n\n<iframe src="https://example.com/e"></iframe>\n\nAfter');
    is(embed.includes("<iframe"), "an iframe embed survives conversion");
    is((await markdownToHtml('text <span class="x">inline</span> html')).includes('<span class="x">'),
       "inline HTML survives");
    is((await markdownToHtml("<!-- wp:paragraph -->\n<p>Block</p>\n<!-- /wp:paragraph -->")).includes("wp:paragraph"),
       "WordPress block comments survive");
  }

  console.log("\n=== markdownToHtml: edges ===");
  {
    eq(await markdownToHtml(""), "", "empty string");
    eq(await markdownToHtml("   \n  "), "", "whitespace only");
    eq(await markdownToHtml(null as unknown as string), "", "null does not throw");
    const amp = await markdownToHtml("Ben & Jerry's");
    is(amp.includes("&#x26;") || amp.includes("&amp;"), "a bare ampersand is escaped, not left raw");
  }
}

markdownChecks()
  .catch((e) => { fail++; console.log("  \u2717 markdown checks threw: " + (e as Error).message); })
  .then(() => {
    console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  });
