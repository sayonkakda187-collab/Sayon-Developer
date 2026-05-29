"use client";

import { useState, type FormEvent } from "react";

type Status = "idle" | "loading" | "success" | "error";

export function CommentForm({ articleId }: { articleId: string }) {
  const [authorName, setAuthorName] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, authorName, content }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (res.ok) {
        setStatus("success");
        setMessage(data.message ?? "Thanks! Your comment is awaiting moderation.");
        setAuthorName("");
        setContent("");
      } else {
        setStatus("error");
        setMessage(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  const inputClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-900";

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3">
      <input
        type="text"
        required
        maxLength={80}
        value={authorName}
        onChange={(e) => setAuthorName(e.target.value)}
        placeholder="Your name"
        aria-label="Your name"
        className={inputClass}
      />
      <textarea
        required
        rows={4}
        maxLength={5000}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Add to the conversation…"
        aria-label="Your comment"
        className={inputClass}
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-60"
        >
          {status === "loading" ? "Posting…" : "Post comment"}
        </button>
        {message && (
          <p
            role="status"
            className={`text-sm ${
              status === "error" ? "text-red-700" : "text-green-700"
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
