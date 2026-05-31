"use client";

import type { RefObject } from "react";

type Props = {
  textareaRef: RefObject<HTMLTextAreaElement>;
  onChange: (next: string) => void;
};

// A small set of Markdown actions. Each wraps/prefixes the current selection and
// keeps focus + a sensible caret so writing stays fluid.
type Action = {
  key: string;
  label: string;
  title: string;
  apply: (sel: string) => { text: string; selStart: number; selEnd: number };
};

const WRAP = (before: string, after: string) => (sel: string) => ({
  text: `${before}${sel}${after}`,
  selStart: before.length,
  selEnd: before.length + sel.length,
});

const ACTIONS: Action[] = [
  { key: "h2", label: "H", title: "Heading", apply: (s) => ({ text: `## ${s}`, selStart: 3, selEnd: 3 + s.length }) },
  { key: "bold", label: "B", title: "Bold (⌘B)", apply: WRAP("**", "**") },
  { key: "italic", label: "I", title: "Italic (⌘I)", apply: WRAP("_", "_") },
  { key: "link", label: "🔗", title: "Link", apply: (s) => ({ text: `[${s || "text"}](https://)`, selStart: s ? s.length + 3 : 1, selEnd: s ? s.length + 3 : 5 }) },
  { key: "quote", label: "❝", title: "Quote", apply: (s) => ({ text: `> ${s}`, selStart: 2, selEnd: 2 + s.length }) },
  { key: "ul", label: "•", title: "Bullet list", apply: (s) => ({ text: `- ${s}`, selStart: 2, selEnd: 2 + s.length }) },
  { key: "ol", label: "1.", title: "Numbered list", apply: (s) => ({ text: `1. ${s}`, selStart: 3, selEnd: 3 + s.length }) },
  { key: "code", label: "</>", title: "Code", apply: WRAP("`", "`") },
];

export function MarkdownToolbar({ textareaRef, onChange }: Props) {
  function run(action: Action) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const value = el.value;
    const sel = value.slice(start, end);
    const { text, selStart, selEnd } = action.apply(sel);
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    // Restore focus + caret after React re-renders the controlled textarea.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + selStart, start + selEnd);
    });
  }

  return (
    <div className="adm-mdtoolbar" role="toolbar" aria-label="Formatting">
      {ACTIONS.map((a) => (
        <button
          key={a.key}
          type="button"
          className="adm-mdbtn"
          title={a.title}
          aria-label={a.title}
          onClick={() => run(a)}
          tabIndex={-1}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
