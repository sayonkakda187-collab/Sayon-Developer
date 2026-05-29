import { prisma } from "@/lib/db";

// This temporary page reads live from the database to verify the Phase 1
// setup (schema + Prisma client + seed data). Phase 2 replaces it with the
// real magazine homepage.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [categories, articles, tagCount] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.article.findMany({
      where: { status: "published" },
      orderBy: { publishedAt: "desc" },
      include: { category: true },
    }),
    prisma.tag.count(),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-widest text-blue-600">
        Phase 1 · Setup &amp; Database
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">
        Scaffolding is live ✅
      </h1>
      <p className="mt-3 text-gray-600">
        This temporary page reads directly from the database through Prisma to
        prove the schema, client, and seed data all work end to end. Phase 2
        replaces it with the real homepage.
      </p>

      <dl className="mt-8 grid grid-cols-3 gap-4">
        <Stat label="Categories" value={categories.length} />
        <Stat label="Articles" value={articles.length} />
        <Stat label="Tags" value={tagCount} />
      </dl>

      <h2 className="mt-10 text-xl font-semibold">Seeded articles</h2>
      <ul className="mt-3 divide-y divide-gray-200 border-y border-gray-200">
        {articles.map((article) => (
          <li
            key={article.id}
            className="flex items-baseline justify-between gap-4 py-3"
          >
            <span className="font-medium">{article.title}</span>
            <span className="shrink-0 text-sm text-gray-500">
              {article.category?.name} · {article.views} views
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 text-center">
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-gray-500">
        {label}
      </div>
    </div>
  );
}
