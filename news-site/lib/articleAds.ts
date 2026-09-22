/**
 * Where the "before paragraph 2" ad goes in an article body.
 *
 * Pure and dependency-free so `npm run check:ads` can exercise it directly —
 * the same reason `lib/wordpress/format.ts` sits outside its server-only client.
 *
 * The block splitter and the paragraph test are carried over from the retired
 * `lib/articleSplit.ts`, which earned them: the naive `content.split(/\n{2,}/)`
 * used elsewhere on the article page treats a BLANK LINE INSIDE A FENCED CODE
 * BLOCK as a block boundary, so cutting there halves the fence and renders the
 * rest of the story as one enormous code block.
 */

const FENCE_OPEN = /^\s{0,3}(`{3,}|~{3,})/;

/** Link-reference and footnote definitions: `[id]: url` / `[^1]: note`. */
const DEFINITION = /^\s{0,3}\[\^?[^\]]+\]:/;

/** Split markdown into top-level blocks, never breaking inside a code fence. */
export function splitIntoBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let fenceChar: string | null = null;
  let fenceLen = 0;

  const flush = () => {
    if (current.length) {
      blocks.push(current.join("\n"));
      current = [];
    }
  };

  for (const line of markdown.split("\n")) {
    if (fenceChar) {
      current.push(line);
      // A fence closes on a line of >= as many of the same character.
      const close = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fenceChar && close[1].length >= fenceLen) {
        fenceChar = null;
        fenceLen = 0;
      }
      continue;
    }

    const open = line.match(FENCE_OPEN);
    if (open) {
      fenceChar = open[1][0];
      fenceLen = open[1].length;
      current.push(line);
      continue;
    }

    if (line.trim() === "") {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();
  return blocks;
}

/**
 * Is this block a PARAGRAPH of prose? Headings, lists, quotes, code, tables,
 * rules, raw HTML, reference definitions and image-only blocks are not — so
 * "paragraph 2" means the second block a reader would call a paragraph, not the
 * second block in the file.
 */
export function isParagraph(block: string): boolean {
  const text = block.trim();
  if (!text) return false;

  if (FENCE_OPEN.test(text)) return false;                             // code fence
  if (/^\s{0,3}#{1,6}\s/.test(text)) return false;                     // ATX heading
  if (/^\s{0,3}>/.test(text)) return false;                            // blockquote
  if (/^\s{0,3}([-*+]|\d{1,9}[.)])\s/.test(text)) return false;        // list item
  if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(text)) return false;     // thematic break
  if (/^\s{0,3}\|/.test(text)) return false;                           // table row
  if (/^\s{0,3}</.test(text)) return false;                            // raw HTML block
  if (DEFINITION.test(text)) return false;                             // link/footnote def
  if (/^!\[[^\]]*\]\([^)]*\)$/.test(text)) return false;               // image-only

  // Setext heading: a line of text underlined by === or ---.
  const lines = text.split("\n");
  if (lines.length === 2 && /^\s{0,3}(={2,}|-{2,})\s*$/.test(lines[1])) return false;

  return true;
}

/**
 * Split a body so an ad can sit immediately BEFORE the second paragraph.
 *
 * Returns null — meaning place nothing — when the body has no second paragraph
 * to sit in front of. An ad appended to a one-paragraph article would land at
 * the end of the story, which is not what "before paragraph 2" asks for, and
 * there is already an end-of-article unit there.
 *
 * A link-reference or footnote definition below the cut is NOT a reason to
 * refuse here: the two halves are rendered as separate markdown documents, so
 * references are resolved per half either way — that is a pre-existing property
 * of splitting the body at all, not something this placement introduces.
 */
export function splitBeforeSecondParagraph(
  content: string,
): { before: string; after: string } | null {
  if (!content || !content.trim()) return null;

  const blocks = splitIntoBlocks(content);
  let seen = 0;

  for (let i = 0; i < blocks.length; i++) {
    if (!isParagraph(blocks[i])) continue;
    seen++;
    if (seen < 2) continue;

    const before = blocks.slice(0, i).join("\n\n").trim();
    const after = blocks.slice(i).join("\n\n").trim();
    // Both sides must carry something, or the ad ends up at one edge of the
    // body rather than inside it.
    return before && after ? { before, after } : null;
  }

  return null;
}
