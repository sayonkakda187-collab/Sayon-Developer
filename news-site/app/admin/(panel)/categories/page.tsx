import { prisma } from "@/lib/db";
import {
  createCategory,
  deleteCategory,
  createTag,
  deleteTag,
} from "@/app/admin/actions";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { categoryColor } from "@/components/admin/ArticleRow";
import { CategoryGlyph, PlusIcon } from "@/components/admin/icons";

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

  return (
    <div>
      <div className="adm-page-h">
        <h1>Categories &amp; Tags</h1>
        <p>
          {categories.length} categor{categories.length === 1 ? "y" : "ies"} · {tags.length} tag
          {tags.length === 1 ? "" : "s"}
        </p>
      </div>

      {/* Category cards */}
      {categories.map((c, i) => (
        <div key={c.id} className="adm-card adm-catcard" style={{ marginBottom: 11 }}>
          <span className="adm-ci" style={{ background: categoryColor(c.name, i) }}>
            <CategoryGlyph name={c.name} className="h-[22px] w-[22px]" />
          </span>
          <div className="adm-cb">
            <div className="adm-cn">{c.name}</div>
            <div className="adm-cd">
              {c._count.articles} published article{c._count.articles === 1 ? "" : "s"}
            </div>
          </div>
          <div className="adm-cc">{c._count.articles}</div>
          <DeleteButton
            action={deleteCategory}
            id={c.id}
            label={<TrashGlyph />}
            className="adm-del"
            confirmText={`Delete category “${c.name}”? Its articles will be uncategorized.`}
          />
        </div>
      ))}

      {/* Add category */}
      <form action={createCategory} className="adm-card adm-card-pad" style={{ marginBottom: 22 }}>
        <div className="adm-card-title" style={{ marginBottom: 10 }}>Add category</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input name="name" placeholder="Category name" required className="adm-input" />
          <input name="description" placeholder="Description (optional)" className="adm-input" />
          <button className="adm-btn-primary" style={{ flex: "none", alignSelf: "flex-start", padding: "10px 16px" }}>
            <PlusIcon className="h-[15px] w-[15px]" />
            Add category
          </button>
        </div>
      </form>

      {/* Tags */}
      <div className="adm-card-title">Tags</div>
      <div className="adm-tags">
        {tags.length === 0 && <p className="adm-card-sub">No tags yet.</p>}
        {tags.map((t) => (
          <span key={t.id} className="adm-tag">
            {t.name}
            <b>{t._count.articles}</b>
            <DeleteButton
              action={deleteTag}
              id={t.id}
              label="×"
              className="adm-del"
              confirmText={`Delete tag “${t.name}”?`}
            />
          </span>
        ))}
      </div>

      <form action={createTag} className="adm-card adm-card-pad" style={{ marginTop: 14 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input name="name" placeholder="New tag" required className="adm-input" />
          <button className="adm-btn-primary" style={{ flex: "none", padding: "10px 16px" }}>Add</button>
        </div>
      </form>
    </div>
  );
}

function TrashGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
      aria-hidden
    >
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
