import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";

/**
 * Markdown → HTML for WordPress.
 *
 * WordPress stores `post_content` as HTML, so Markdown typed in the editor has
 * to be converted before it is sent; posting Markdown directly would publish
 * literal `**bold**` and `## headings`.
 *
 * Built on the same remark pipeline the rest of the app already uses —
 * `remark-gfm` is a direct dependency and powers the public article renderer —
 * so tables, strikethrough, task lists and autolinks behave identically here
 * and there. Only `rehype-stringify` was added to complete the chain.
 *
 * RAW HTML IS PASSED THROUGH (`allowDangerousHtml` on both ends), which is
 * deliberate. Markdown routinely carries embeds — an iframe, a figure, a
 * WordPress block comment — and dropping them silently would be worse than
 * useless. The safety argument holds because this content is written by the
 * site's own administrator (the same trust level as the raw-HTML field this
 * replaced) and because WordPress applies its own `wp_kses` filtering on
 * arrival, according to the posting account's `unfiltered_html` capability.
 * It is NOT a channel for untrusted input, and must not become one.
 *
 * No `import "server-only"` here: the module holds no credentials, and keeping
 * it importable means the conversion can be unit-tested directly. It is only
 * ever called from server actions, so the pipeline never ships to the browser.
 */
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeStringify, { allowDangerousHtml: true });

export async function markdownToHtml(markdown: string): Promise<string> {
  const source = markdown ?? "";
  if (!source.trim()) return "";
  const file = await processor.process(source);
  return String(file).trim();
}
