/**
 * Splits article Markdown at a paragraph boundary so an in-article ad can sit
 * between the two halves.
 *
 * Operates on top-level BLOCKS (runs of lines separated by blank lines) rather
 * than on `\n\n` directly, because a blank line inside a fenced code block is
 * not a block boundary. Splitting there would cut a fence in half and turn the
 * rest of the article into one big code block.
 *
 * Only real paragraphs are counted. Headings, lists, blockquotes, tables,
 * thematic breaks, code fences and image-only blocks are skipped, so the ad
 * cannot land between a heading and the text it introduces, or directly under a
 * lead image.
 *
 * The split never falls immediately before a list, table, code block or
 * blockquote. A paragraph that runs straight into one of those is almost always
 * introducing it ("Three trends collided at once:"), and cutting between them
 * reads as a mistake — so the split point moves PAST that block, keeping the
 * pair together and still placing the ad early in the body. (Moving on to the
 * next paragraph instead would push the ad to the end of a list-heavy article,
 * which is not where it was asked to go.)
 */

export type ArticleSplit = {
  /** Markdown to render before the ad. */
  before: string;
  /** Markdown to render after the ad. Empty means "ad goes at the end". */
  after: string;
};

const FENCE_OPEN = /^\s{0,3}(`{3,}|~{3,})/;

/** Link-reference and footnote definitions: `[id]: url` / `[^1]: note`. */
const DEFINITION = /^\s{0,3}\[\^?[^\]]+\]:/;

function splitIntoBlocks(markdown: string): string[] {
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
 * Blocks that usually belong to the paragraph above them, so nothing should be
 * inserted in between. Headings are deliberately NOT here: a heading opens a new
 * section, and an ad just before one sits at a natural break.
 */
function isContinuation(block: string): boolean {
  const text = block.trim();
  if (!text) return false;
  if (FENCE_OPEN.test(text)) return true;                          // code block
  if (/^\s{0,3}([-*+]|\d{1,9}[.)])\s/.test(text)) return true;     // list
  if (/^\s{0,3}\|/.test(text)) return true;                        // table
  if (/^\s{0,3}>/.test(text)) return true;                         // blockquote
  return false;
}

function isParagraph(block: string): boolean {
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
 * @param afterParagraph which paragraph to place the ad after (1-based).
 * @returns `after: ""` when the article is too short to split, meaning the ad
 *          belongs at the end of the content.
 */
export function splitArticleForAd(content: string, afterParagraph = 2): ArticleSplit {
  const source = content ?? "";
  const atEnd: ArticleSplit = { before: source, after: "" };
  if (!source.trim() || afterParagraph < 1) return atEnd;

  const blocks = splitIntoBlocks(source);

  let seen = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (!isParagraph(blocks[i])) continue;
    seen++;
    if (seen < afterParagraph) continue;

    // Keep a paragraph joined to the list/table/quote/code it introduces by
    // moving the cut to after that run, rather than between them.
    let cut = i;
    while (isContinuation(blocks[cut + 1] ?? "")) cut++;

    const rest = blocks.slice(cut + 1);
    if (!rest.join("").trim()) return atEnd; // nothing would follow the ad

    // A definition below the split would be orphaned from references above it,
    // silently breaking those links. Keep the article whole instead.
    if (rest.some((b) => DEFINITION.test(b.trim()))) return atEnd;

    return { before: blocks.slice(0, cut + 1).join("\n\n"), after: rest.join("\n\n") };
  }

  return atEnd; // fewer than `afterParagraph` paragraphs
}
