// Client-safe helpers for turning AI Assist output into clean editor fields.
// Pure string functions (no server-only imports) so both the server lib and the
// browser editor can use them. The goal: NEVER let AI reminder/editor's-note
// text reach the publishable Content, and produce a clean Excerpt.

// Phrases that mark a general AI reminder / editor's note (as opposed to a useful
// inline [VERIFY: …] fact marker, which we keep).
const REMINDER_PATTERNS: RegExp[] = [
  /ai draft\s*[—–-]\s*review/i,
  /review,?\s*fact-?check,?\s*and edit before publish/i,
  /verify all facts/i,
  /write in your own words/i,
  /rewrite in your own words/i,
  /independently verified before publication/i,
  /must be (?:independently )?verified before publi/i,
  /before publication\b/i,
  /editor'?s note/i,
  /disclaimer/i,
];

function isReminderLine(line: string): boolean {
  const t = line
    .replace(/^[>*_\s#-]+/, "") // strip leading blockquote/emphasis/heading marks
    .trim();
  if (!t) return false;
  return REMINDER_PATTERNS.some((re) => re.test(t));
}

/**
 * Strip any general AI reminder / "editor's note" / "verify before publication"
 * header or footer from a draft body — including a leading blockquote disclaimer
 * and a trailing "---" + note. Keeps the real article text and inline
 * [VERIFY: …] markers. Idempotent and safe on already-clean drafts.
 */
export function sanitizeDraft(input: string): string {
  let text = (input ?? "").replace(/\r\n/g, "\n");

  // Split into blocks on blank lines so we can drop whole reminder blocks.
  const blocks = text.split(/\n{2,}/);

  // Drop leading reminder blocks (e.g. the top "> ⚠️ AI draft — review…" line).
  while (blocks.length && blocks[0].split("\n").every((l) => isReminderLine(l) || !l.trim())) {
    blocks.shift();
  }

  // Drop trailing reminder blocks, and a trailing "---" divider that only
  // separated such a note.
  while (blocks.length) {
    const last = blocks[blocks.length - 1];
    const lastTrim = last.trim();
    const isDivider = /^-{3,}$|^\*{3,}$|^_{3,}$/.test(lastTrim);
    const isReminderBlock = lastTrim.length > 0 && last.split("\n").every((l) => isReminderLine(l) || !l.trim());
    if (isReminderBlock || isDivider) {
      blocks.pop();
    } else {
      break;
    }
  }

  text = blocks.join("\n\n");

  // Final pass: remove any stray single reminder lines left mid-text, and a now-
  // dangling trailing divider.
  text = text
    .split("\n")
    .filter((l) => !isReminderLine(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n*\s*-{3,}\s*$/g, "")
    .trim();

  return text;
}

/** Strip markdown, [VERIFY: …] markers, and reminder text → clean prose. */
function stripToProse(input: string): string {
  return (input ?? "")
    .replace(/\[VERIFY:[^\]]*\]/gi, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[>*\-+]\s+/gm, "")
    .replace(/[*_~`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Produce a clean excerpt (~120-160 chars, plain prose) from the AI's excerpt
 * field, falling back to the brief, then the draft's first sentences. Never
 * contains markdown, [VERIFY] markers, or reminder text.
 */
export function cleanExcerpt(opts: { excerpt?: string; brief?: string; draft?: string }): string {
  const source =
    [opts.excerpt, opts.brief].map((s) => stripToProse(s ?? "")).find((s) => s.length >= 20) ||
    stripToProse(sanitizeDraft(opts.draft ?? ""));
  if (!source) return "";

  const TARGET = 160;
  if (source.length <= TARGET) return source;

  // Prefer cutting at a sentence boundary within range, else at a word boundary.
  const window = source.slice(0, TARGET + 40);
  const sentenceEnd = window.search(/[.!?]\s/);
  if (sentenceEnd >= 100) return window.slice(0, sentenceEnd + 1).trim();

  const cut = source.slice(0, TARGET);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : TARGET).trim()}…`;
}

/**
 * Does this content still look like it contains AI reminder text or unresolved
 * [VERIFY: …] markers? Used for a gentle pre-publish confirm (non-blocking).
 */
export function hasAiLeftovers(content: string): { verify: boolean; reminder: boolean } {
  const verify = /\[VERIFY:/i.test(content);
  const reminder = content.split("\n").some((l) => isReminderLine(l));
  return { verify, reminder };
}
