import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "@/lib/markdownComponents";

// Renders trusted (admin-authored) Markdown. react-markdown does not render raw
// HTML by default, so injected markup is not executed.
export function Markdown({ content }: { content: string }) {
  return (
    <div className="mt-8 text-[1.075rem] leading-8 text-gray-800">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
