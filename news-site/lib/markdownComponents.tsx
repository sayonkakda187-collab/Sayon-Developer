import type { Components } from "react-markdown";

// Shared element styling for rendered Markdown, used by the public article view
// (server) and the admin editor preview (client). Tuned for comfortable reading.
export const markdownComponents: Components = {
  h1: ({ node, ...props }) => (
    <h2 className="mb-4 mt-12 font-display text-2xl font-semibold tracking-tight text-fg sm:text-3xl" {...props} />
  ),
  h2: ({ node, ...props }) => (
    <h2 className="mb-4 mt-12 font-display text-2xl font-semibold tracking-tight text-fg sm:text-3xl" {...props} />
  ),
  h3: ({ node, ...props }) => (
    <h3 className="mb-3 mt-8 font-display text-xl font-semibold tracking-tight text-fg" {...props} />
  ),
  p: ({ node, ...props }) => <p className="my-5 leading-[1.8]" {...props} />,
  ul: ({ node, ...props }) => (
    <ul className="my-5 list-disc space-y-2 pl-6 marker:text-fg-faint" {...props} />
  ),
  ol: ({ node, ...props }) => (
    <ol className="my-5 list-decimal space-y-2 pl-6 marker:text-fg-faint" {...props} />
  ),
  li: ({ node, ...props }) => <li className="pl-1 leading-[1.7]" {...props} />,
  blockquote: ({ node, ...props }) => (
    <blockquote
      className="my-8 border-l-4 border-accent pl-5 font-display text-xl italic leading-relaxed text-fg"
      {...props}
    />
  ),
  a: ({ node, ...props }) => (
    <a
      className="font-medium text-accent-link underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent"
      {...props}
    />
  ),
  strong: ({ node, ...props }) => (
    <strong className="font-semibold text-fg" {...props} />
  ),
  hr: () => <hr className="my-10 border-border" />,
  pre: ({ node, ...props }) => (
    <pre
      className="my-6 overflow-x-auto rounded-xl bg-surface-2 p-4 text-sm leading-relaxed [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-fg"
      {...props}
    />
  ),
  code: ({ node, ...props }) => (
    <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.9em] text-fg" {...props} />
  ),
  img: ({ node, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="my-8 w-full rounded-xl" alt="" loading="lazy" {...props} />
  ),
  table: ({ node, ...props }) => (
    <div className="my-6 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: ({ node, ...props }) => (
    <th className="border-b border-border bg-surface-2 px-3 py-2 text-left font-semibold text-fg" {...props} />
  ),
  td: ({ node, ...props }) => (
    <td className="border-b border-border px-3 py-2" {...props} />
  ),
};
