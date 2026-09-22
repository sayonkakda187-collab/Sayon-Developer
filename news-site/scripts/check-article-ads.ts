import { splitBeforeSecondParagraph, isParagraph, splitIntoBlocks } from "../lib/articleAds";

let pass = 0, fail = 0;
const is = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓ " + m)) : (fail++, console.log("  ✗ " + m)); };
const eq = (a: unknown, b: unknown, m: string) =>
  is(a === b, `${m}${a === b ? "" : `  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);

const P = (n: number) => `Paragraph ${n} runs on for a little while so it reads like real prose.`;

console.log("\n=== the ad lands before the SECOND paragraph ===");
{
  const r = splitBeforeSecondParagraph([P(1), P(2), P(3)].join("\n\n"));
  is(r !== null, "a three-paragraph body splits");
  eq(r?.before, P(1), "everything above the cut is paragraph 1");
  is(!!r && r.after.startsWith(P(2)), "everything below starts at paragraph 2");
  is(!!r && r.after.includes(P(3)), "and keeps the rest of the story");
}

console.log("\n=== bodies with nowhere to put it are left alone ===");
eq(splitBeforeSecondParagraph(P(1)), null, "one paragraph → no split");
eq(splitBeforeSecondParagraph(""), null, "empty content");
eq(splitBeforeSecondParagraph("   \n\n  "), null, "whitespace only");
eq(splitBeforeSecondParagraph("## Just a heading"), null, "a heading is not a paragraph");
eq(splitBeforeSecondParagraph(["## A", "## B", "## C"].join("\n\n")), null, "headings only");
eq(splitBeforeSecondParagraph(["- one", "- two", "- three"].join("\n\n")), null, "list items only");

console.log("\n=== 'paragraph' means prose, not any block ===");
{
  // A heading between the two paragraphs must not be counted as paragraph 2.
  const r = splitBeforeSecondParagraph([P(1), "## A section", P(2)].join("\n\n"));
  is(r !== null, "heading between the paragraphs still splits");
  is(!!r && r.before.includes("## A section"), "the heading stays ABOVE the ad, with paragraph 1");
  is(!!r && r.after.startsWith(P(2)), "the ad sits directly before paragraph 2");
}
{
  const r = splitBeforeSecondParagraph([P(1), "- a\n- b", "> quoted", P(2)].join("\n\n"));
  is(!!r && r.after.startsWith(P(2)), "a list and a quote do not count as paragraphs");
  is(!!r && r.before.includes("> quoted"), "they stay above the cut");
}
{
  const img = "![a photo](https://example.com/p.jpg)";
  const r = splitBeforeSecondParagraph([P(1), img, P(2)].join("\n\n"));
  is(!!r && r.after.startsWith(P(2)), "an image-only block is not a paragraph");
}
{
  const r = splitBeforeSecondParagraph([P(1), "| a | b |\n| - | - |", P(2)].join("\n\n"));
  is(!!r && r.after.startsWith(P(2)), "a table row is not a paragraph");
}
{
  const r = splitBeforeSecondParagraph([P(1), "---", P(2)].join("\n\n"));
  is(!!r && r.after.startsWith(P(2)), "a thematic break is not a paragraph");
}
{
  const r = splitBeforeSecondParagraph([P(1), "<div>raw</div>", P(2)].join("\n\n"));
  is(!!r && r.after.startsWith(P(2)), "a raw HTML block is not a paragraph");
}
{
  const r = splitBeforeSecondParagraph([P(1), "[ref]: https://example.com", P(2)].join("\n\n"));
  is(!!r && r.after.startsWith(P(2)), "a link-reference definition is not a paragraph");
}
{
  const r = splitBeforeSecondParagraph(["A setext heading\n===", P(1), P(2)].join("\n\n"));
  is(!!r && r.before.includes("setext"), "a setext heading is not a paragraph");
  is(!!r && r.after.startsWith(P(2)), "so the cut is still before prose paragraph 2");
}

console.log("\n=== a code fence is never cut in half ===");
{
  // The blank line inside this fence is NOT a block boundary. Splitting on
  // /\n{2,}/ would cut here and turn the rest of the article into one code block.
  const fence = "```js\nconst a = 1;\n\nconst b = 2;\n```";
  const r = splitBeforeSecondParagraph([P(1), fence, P(2)].join("\n\n"));
  is(r !== null, "a body with a fence still splits");
  const whole = (s: string) => (s.match(/```/g) || []).length % 2 === 0;
  is(!!r && whole(r.before), "the half above the ad has balanced fences");
  is(!!r && whole(r.after), "so does the half below");
  is(!!r && r.before.includes("const b = 2;"), "the fence stays intact, above the cut");
  is(!!r && r.after.startsWith(P(2)), "the ad still lands before paragraph 2");
}
{
  const fence = "~~~\nplain\n\nfenced\n~~~";
  const r = splitBeforeSecondParagraph([P(1), fence, P(2)].join("\n\n"));
  is(!!r && r.before.includes("fenced"), "tilde fences are handled too");
}
{
  // Paragraph-looking lines INSIDE a fence must not advance the count.
  const fence = "```\nSome text.\n\nMore text.\n```";
  const r = splitBeforeSecondParagraph([P(1), fence, P(2)].join("\n\n"));
  is(!!r && r.after.startsWith(P(2)), "prose inside a fence is not counted as a paragraph");
}

console.log("\n=== nothing is lost or duplicated ===");
{
  const body = [P(1), "## Section", P(2), "- a list", P(3)].join("\n\n");
  const r = splitBeforeSecondParagraph(body);
  const rejoined = `${r!.before}\n\n${r!.after}`;
  eq(rejoined.replace(/\s+/g, " ").trim(), body.replace(/\s+/g, " ").trim(),
     "before + after reconstructs the original body exactly");
}

console.log("\n=== the building blocks behave ===");
eq(splitIntoBlocks("a\n\nb\n\nc").length, 3, "splitIntoBlocks counts top-level blocks");
eq(splitIntoBlocks("```\na\n\nb\n```").length, 1, "a fence is one block, blank line and all");
is(isParagraph("Just some prose."), "prose is a paragraph");
is(!isParagraph("# Heading"), "a heading is not");
is(!isParagraph(""), "an empty block is not");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
