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
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900";

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      {/* Categories */}
      <section>
        <h1 className="font-serif text-2xl font-bold">Categories</h1>

        <ul className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {categories.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-500">No categories yet.</li>
          )}
          {categories.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-gray-400">
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

        <form action={createCategory} className="mt-4 space-y-2">
          <input name="name" placeholder="Category name" required className={inputClass} />
          <input name="description" placeholder="Description (optional)" className={inputClass} />
          <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
            Add category
          </button>
        </form>
      </section>

      {/* Tags */}
      <section>
        <h2 className="font-serif text-2xl font-bold">Tags</h2>

        <div className="mt-4 flex flex-wrap gap-2">
          {tags.length === 0 && (
            <p className="text-sm text-gray-500">No tags yet.</p>
          )}
          {tags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
            >
              #{t.name}
              <span className="text-xs text-gray-400">{t._count.articles}</span>
              <DeleteButton
                action={deleteTag}
                id={t.id}
                label="×"
                confirmText={`Delete tag "${t.name}"?`}
                className="font-bold text-gray-400 hover:text-red-700"
              />
            </span>
          ))}
        </div>

        <form action={createTag} className="mt-4 space-y-2">
          <input name="name" placeholder="Tag name" required className={inputClass} />
          <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
            Add tag
          </button>
        </form>
      </section>
    </div>
  );
}
