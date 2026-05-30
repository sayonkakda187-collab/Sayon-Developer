import { prisma } from "@/lib/db";
import {
  createCategory,
  deleteCategory,
  createTag,
  deleteTag,
} from "@/app/admin/actions";
import { DeleteButton } from "@/components/admin/DeleteButton";

export default async function CategoriesPage() {
  const [categories, tags] = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { articles: true } } },
    }),
    prisma.tag.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { articles: true } } },
    }),
  ]);

  const inputClass =
    "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-accent";
  const primaryBtn =
    "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition hover:opacity-90";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Categories &amp; Tags</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Organize how stories are grouped and labeled.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold">Categories</h2>
          </div>
          <ul className="divide-y divide-border">
            {categories.length === 0 && (
              <li className="px-5 py-3 text-sm text-fg-faint">
                No categories yet.
              </li>
            )}
            {categories.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <p className="font-medium text-fg">{c.name}</p>
                  <p className="text-xs text-fg-faint">
                    /{c.slug} · {c._count.articles} article
                    {c._count.articles === 1 ? "" : "s"}
                  </p>
                </div>
                <DeleteButton
                  action={deleteCategory}
                  id={c.id}
                  confirmText={`Delete category "${c.name}"? Its articles will be uncategorized.`}
                />
              </li>
            ))}
          </ul>
          <form action={createCategory} className="space-y-2 border-t border-border p-5">
            <input name="name" placeholder="Category name" required className={inputClass} />
            <input name="description" placeholder="Description (optional)" className={inputClass} />
            <button className={primaryBtn}>Add category</button>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold">Tags</h2>
          </div>
          <div className="flex flex-wrap gap-2 p-5">
            {tags.length === 0 && (
              <p className="text-sm text-fg-faint">No tags yet.</p>
            )}
            {tags.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-sm text-fg-muted"
              >
                #{t.name}
                <span className="text-xs text-fg-faint">{t._count.articles}</span>
                <DeleteButton
                  action={deleteTag}
                  id={t.id}
                  label="×"
                  confirmText={`Delete tag "${t.name}"?`}
                  className="font-bold text-fg-faint transition-colors hover:text-red-600"
                />
              </span>
            ))}
          </div>
          <form action={createTag} className="space-y-2 border-t border-border p-5">
            <input name="name" placeholder="Tag name" required className={inputClass} />
            <button className={primaryBtn}>Add tag</button>
          </form>
        </section>
      </div>
    </div>
  );
}
