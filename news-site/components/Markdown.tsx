import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders trusted (admin-authored) Markdown. react-markdown does not render raw
// HTML by default, so this is safe against injected markup. Each element is
// mapped to a styled tag rather than relying on a typography plugin.
export function Markdown({ content }: { content: string }) {
  return (
    <div className="mt-8 text-[1.075rem] leading-8 text-gray-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => (
            <h2 className="mt-10 font-serif text-2xl font-bold text-gray-900" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="mt-10 font-serif text-2xl font-bold text-gray-900" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="mt-8 font-serif text-xl font-bold text-gray-900" {...props} />
          ),
          p: ({ node, ...props }) => <p className="my-5" {...props} />,
          ul: ({ node, ...props }) => (
            <ul className="my-5 list-disc space-y-2 pl-6" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="my-5 list-decimal space-y-2 pl-6" {...props} />
          ),
          li: ({ node, ...props }) => <li className="pl-1" {...props} />,
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="my-6 border-l-4 border-red-700 pl-4 italic text-gray-600"
              {...props}
            />
          ),
          a: ({ node, ...props }) => (
            <a
              className="text-red-700 underline underline-offset-2 hover:no-underline"
              {...props}
            />
          ),
          strong: ({ node, ...props }) => (
            <strong className="font-semibold text-gray-900" {...props} />
          ),
          hr: () => <hr className="my-8 border-gray-200" />,
          code: ({ node, ...props }) => (
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[0.9em]" {...props} />
          ),
          table: ({ node, ...props }) => (
            <div className="my-6 overflow-x-auto">
              <table className="w-full border-collapse text-sm" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left font-semibold" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="border border-gray-200 px-3 py-2" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
