"use client";

import { useRef, useState, type ChangeEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "@/lib/markdownComponents";

type Category = { id: string; name: string };
type Tag = { id: string; name: string };
type ArticleInput = {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage: string | null;
  categoryId: string | null;
  status: string;
  tagIds: string[];
};

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900";

export function ArticleForm({
  action,
  categories,
  tags,
  article,
}: {
  action: (formData: FormData) => void | Promise<void>;
  categories: Category[];
  tags: Tag[];
  article?: ArticleInput;
}) {
  const [content, setContent] = useState(article?.content ?? "");
  const [coverImage, setCoverImage] = useState(article?.coverImage ?? "");
  const [showPreview, setShowPreview] = useState(false);
  const [uploading, setUploading] = useState<null | "cover" | "inline">(null);
  const [uploadError, setUploadError] = useState("");
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const checkedTags = new Set(article?.tagIds ?? []);

  async function uploadFile(file: File): Promise<string | null> {
    setUploadError("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    const data = (await res.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };
    if (!res.ok || !data.url) {
      setUploadError(data.error ?? "Upload failed.");
      return null;
    }
    return data.url;
  }

  async function onCoverSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading("cover");
    const url = await uploadFile(file);
    setUploading(null);
    if (url) setCoverImage(url);
  }

  async function onInlineSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading("inline");
    const url = await uploadFile(file);
    setUploading(null);
    if (url) {
      setContent(
        (c) =>
          `${c}${c && !c.endsWith("\n") ? "\n\n" : ""}![${file.name}](${url})\n`,
      );
    }
  }

  return (
    <form action={action} className="space-y-6">
      {article?.id && <input type="hidden" name="id" value={article.id} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold">
          {article?.id ? "Edit article" : "New article"}
          {article && (
            <span
              className={`ml-3 align-middle rounded-full px-2 py-0.5 text-xs font-medium ${
                article.status === "published"
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {article.status}
            </span>
          )}
        </h1>
        <div className="flex gap-2">
          <button
            type="submit"
            name="status"
            value="draft"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Save draft
          </button>
          <button
            type="submit"
            name="status"
            value="published"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Publish
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Title</label>
            <input
              name="title"
              required
              defaultValue={article?.title}
              className={`${inputClass} mt-1 font-serif text-lg`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Excerpt
            </label>
            <textarea
              name="excerpt"
              required
              rows={2}
              defaultValue={article?.excerpt}
              className={`${inputClass} mt-1`}
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">
                Content (Markdown)
              </label>
              <div className="flex items-center gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => inlineInputRef.current?.click()}
                  className="text-gray-600 hover:text-gray-900"
                >
                  {uploading === "inline" ? "Uploading…" : "Insert image"}
                </button>
                <input
                  ref={inlineInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={onInlineSelected}
                />
                <button
                  type="button"
                  onClick={() => setShowPreview((p) => !p)}
                  className="text-gray-600 hover:text-gray-900"
                >
                  {showPreview ? "Write" : "Preview"}
                </button>
              </div>
            </div>

            {showPreview ? (
              <div className="mt-1 min-h-[20rem] rounded-md border border-gray-200 bg-white px-4 py-3">
                {content.trim() ? (
                  <div className="text-[1.02rem] leading-7 text-gray-800">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Nothing to preview yet.</p>
                )}
              </div>
            ) : (
              <textarea
                name="content"
                rows={18}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your story in Markdown…"
                className={`${inputClass} mt-1 font-mono text-sm leading-6`}
              />
            )}
            {/* Keep content in the form even while previewing. */}
            {showPreview && <input type="hidden" name="content" value={content} />}

            {uploadError && (
              <p className="mt-2 text-sm text-red-700">{uploadError}</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Category
            </label>
            <select
              name="categoryId"
              defaultValue={article?.categoryId ?? ""}
              className={`${inputClass} mt-1`}
            >
              <option value="">— None —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Cover image
            </label>
            {coverImage && (
              <div className="relative mt-2 overflow-hidden rounded-md border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverImage}
                  alt="Cover preview"
                  className="aspect-[16/9] w-full object-cover"
                />
              </div>
            )}
            <input
              type="text"
              name="coverImage"
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              placeholder="Image URL or upload below"
              className={`${inputClass} mt-2`}
            />
            <label className="mt-2 inline-block cursor-pointer text-sm text-gray-600 hover:text-gray-900">
              {uploading === "cover" ? "Uploading…" : "Upload cover image"}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={onCoverSelected}
              />
            </label>
          </div>

          <div>
            <span className="block text-sm font-medium text-gray-700">Tags</span>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
              {tags.length === 0 ? (
                <p className="text-xs text-gray-400">No tags yet.</p>
              ) : (
                tags.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="tagIds"
                      value={t.id}
                      defaultChecked={checkedTags.has(t.id)}
                    />
                    {t.name}
                  </label>
                ))
              )}
            </div>
            <input
              type="text"
              name="newTags"
              placeholder="New tags (comma separated)"
              className={`${inputClass} mt-2`}
            />
          </div>
        </div>
      </div>
    </form>
  );
}
