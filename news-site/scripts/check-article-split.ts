import { splitArticleForAd } from "../lib/articleSplit";

let pass = 0, fail = 0;
const is = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓ " + m)) : (fail++, console.log("  ✗ " + m)); };

// No markdown content may be lost by the split.
const noLoss = (src: string, label: string) => {
  const { before, after } = splitArticleForAd(src);
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  is(norm(before + " " + after) === norm(src), `${label}: no content lost`);
};

console.log("\n=== normal article ===");
{
  const md = `First paragraph here.\n\nSecond paragraph here.\n\nThird paragraph.\n\nFourth paragraph.`;
  const r = splitArticleForAd(md);
  is(r.before.includes("Second paragraph"), "ad goes after the 2nd paragraph");
  is(!r.before.includes("Third paragraph"), "3rd paragraph is below the ad");
  is(r.after.includes("Third paragraph") && r.after.includes("Fourth"), "rest follows the ad");
  noLoss(md, "normal");
}

console.log("\n=== too short to split ===");
{
  const one = splitArticleForAd("Only one paragraph.");
  is(one.after === "", "1 paragraph → ad at the end");
  is(one.before === "Only one paragraph.", "1 paragraph → body untouched");

  const two = splitArticleForAd("One.\n\nTwo.");
  is(two.after === "", "2 paragraphs with nothing after → ad at the end (no empty tail)");

  is(splitArticleForAd("").after === "", "empty content → ad at the end");
  is(splitArticleForAd("# Heading only\n\n## Another").after === "", "no paragraphs → ad at the end");
}

console.log("\n=== fenced code blocks ===");
{
  const md = [
    "Intro paragraph.",
    "",
    "Second paragraph.",
    "",
    "```js",
    "const a = 1;",
    "",           // blank line INSIDE the fence
    "const b = 2;",
    "```",
    "",
    "Closing paragraph.",
  ].join("\n");
  const r = splitArticleForAd(md);
  const fencesIn = (s: string) => (s.match(/```/g) || []).length;
  is(fencesIn(r.before) % 2 === 0, "before half has balanced fences");
  is(fencesIn(r.after) % 2 === 0, "after half has balanced fences");
  // The fence follows "Second paragraph." directly, so the split is refused
  // there and the whole block stays together — wherever it ends up, it must be
  // intact and on one side only.
  const whole = r.before + "\n" + r.after;
  is(whole.includes("const a = 1;") && whole.includes("const b = 2;"), "code block stayed intact");
  is(!(r.before.includes("const a = 1;") && r.after.includes("const b = 2;")),
     "code block was never cut across the ad");
  is(r.after.trim() === "Closing paragraph.", "ad lands after the code block");
  noLoss(md, "code fence");
}
{
  // A blank line inside a fence must not be counted as a paragraph boundary.
  const md = ["Para one.", "", "```", "line", "", "line", "```", "", "Para two.", "", "Para three."].join("\n");
  const r = splitArticleForAd(md);
  is(r.before.includes("Para two.") && !r.before.includes("Para three."),
     "code content is not miscounted as a paragraph");
}

console.log("\n=== blocks that are not paragraphs ===");
{
  const md = [
    "# Title", "", "- item one", "- item two", "", "> a quote", "",
    "| a | b |", "|---|---|", "| 1 | 2 |", "", "---", "",
    "![cover](/img.png)", "", "Real paragraph one.", "", "Real paragraph two.", "", "Real paragraph three.",
  ].join("\n");
  const r = splitArticleForAd(md);
  is(r.before.includes("Real paragraph two."), "headings/lists/quotes/tables/rules/images are not counted");
  is(!r.before.includes("Real paragraph three."), "split lands after the 2nd REAL paragraph");
  is(r.before.includes("![cover]"), "lead image stays above the ad");
  noLoss(md, "mixed blocks");
}

console.log("\n=== never split a paragraph from what it introduces ===");
{
  const md = ["Opening paragraph.", "", "Three trends collided at once:", "",
              "- one", "- two", "", "Paragraph after the list.", "",
              "Final paragraph."].join("\n");
  const r = splitArticleForAd(md);
  is(r.before.includes("- one") && r.before.includes("- two"),
     "list stays with the paragraph that introduces it");
  is(r.before.trim().endsWith("- two"), "ad sits AFTER the list, not before it");
  is(r.after.startsWith("Paragraph after the list."),
     "the ad still lands early in the body, not at the end");
  noLoss(md, "intro paragraph + list");
}
{
  for (const [kind, block] of [["table", "| a | b |\n|---|---|"], ["quote", "> quoted"],
                               ["code", "```\ncode\n```"]] as const) {
    const md = `One.\n\nTwo:\n\n${block}\n\nThree.\n\nFour.`;
    const r = splitArticleForAd(md);
    is(r.before.includes(block.split("\n")[0]), `${kind} stays with its intro paragraph`);
    is(r.after.startsWith("Three."), `${kind}: ad goes straight after it`);
  }
}
{
  // A heading is a natural break — the ad may sit just before one.
  const md = "One.\n\nTwo.\n\n## A heading\n\nThree.";
  const r = splitArticleForAd(md);
  is(r.before.trim().endsWith("Two.") && r.after.startsWith("## A heading"),
     "a heading after the split is allowed (natural section break)");
}

console.log("\n=== definitions must not be orphaned ===");
{
  const ref = `See [the source][src].\n\nSecond paragraph.\n\nThird paragraph.\n\n[src]: https://example.com`;
  is(splitArticleForAd(ref).after === "", "link-reference definition below split → no split");

  const foot = `Claim.[^1]\n\nSecond paragraph.\n\nThird paragraph.\n\n[^1]: The footnote.`;
  is(splitArticleForAd(foot).after === "", "footnote definition below split → no split");

  const safe = `A.\n\nB.\n\n[src]: https://example.com\n\nC.`;
  is(splitArticleForAd(safe).after === "", "definition anywhere below the split is respected");
}

console.log("\n=== parameter ===");
{
  const md = "P1.\n\nP2.\n\nP3.\n\nP4.\n\nP5.";
  const r3 = splitArticleForAd(md, 3);
  is(r3.before.includes("P3.") && !r3.before.includes("P4."), "afterParagraph=3 splits after the 3rd");
  is(splitArticleForAd(md, 0).after === "", "afterParagraph=0 is rejected → ad at end");
  is(splitArticleForAd(md, 99).after === "", "afterParagraph beyond the article → ad at end");
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
