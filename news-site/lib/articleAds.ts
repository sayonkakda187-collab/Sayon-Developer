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
 * Split a body so an ad can sit immediately BEFORE the Nth paragraph.
 *
 * `alreadySeen` is how many paragraphs appeared in EARLIER parts of the body.
 * The article layout has usually already cut the body for its own slots, so
 * paragraph 4 may live in the second or third piece — counting from zero within
 * each piece would put the ad in the wrong place, or lose it entirely.
 *
 * Returns null — meaning place nothing here — when this piece does not contain
 * the Nth paragraph, or when the split would leave one side empty. An ad at the
 * very start or end of the body is not "before paragraph N"; those positions
 * already have units of their own.
 *
 * `paragraphs` is the running count including this piece, so a caller walking
 * several pieces can carry it forward.
 */
export function splitBeforeParagraph(
  content: string,
  n: number,
  alreadySeen = 0,
): { before: string; after: string; paragraphs: number } | null {
  const blocks = content && content.trim() ? splitIntoBlocks(content) : [];
  let seen = alreadySeen;
  let cut = -1;

  for (let i = 0; i < blocks.length; i++) {
    if (!isParagraph(blocks[i])) continue;
    seen++;
    if (seen === n && cut === -1) cut = i;
  }

  const paragraphs = seen;
  if (cut < 1) return null; // not here, or it would sit before the body opens

  const before = blocks.slice(0, cut).join("\n\n").trim();
  const after = blocks.slice(cut).join("\n\n").trim();
  if (!before || !after) return null;
  return { before, after, paragraphs };
}

/** Paragraphs of prose in a body — what "paragraph N" counts. */
export function countParagraphs(content: string): number {
  if (!content || !content.trim()) return 0;
  return splitIntoBlocks(content).filter(isParagraph).length;
}

/**
 * Kept as the name the paragraph-2 slot was introduced with. `splitBeforeParagraph`
 * is the general form; this is the same call with n = 2.
 */
export function splitBeforeSecondParagraph(
  content: string,
): { before: string; after: string } | null {
  const r = splitBeforeParagraph(content, 2);
  return r ? { before: r.before, after: r.after } : null;
}
