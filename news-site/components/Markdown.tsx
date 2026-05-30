import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "@/lib/markdownComponents";

// Renders trusted (admin-authored) Markdown. react-markdown does not render raw
// HTML by default, so injected markup is not executed.
export function Markdown({ content }: { content: string }) {
  return (
    <div className="text-lg text-fg-muted">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
