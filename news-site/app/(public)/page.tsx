import Link from "next/link";
import { getHomepage, type ArticleWithCategory } from "@/lib/queries";
import { FeaturedHero } from "@/components/FeaturedHero";
import { ArticleCard } from "@/components/ArticleCard";
import { Reveal } from "@/components/Reveal";

function SectionHeader({ title, href }: { title: string; href?: string }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-3 border-b border-border">
      <h2 className="-mb-px border-b-[3px] border-accent pb-2.5 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className="pb-2.5 text-xs font-bold uppercase tracking-wide text-accent-link transition-colors hover:text-accent"
        >
          View all →
        </Link>
      )}
    </div>
  );
}

export default async function Home() {
  const { featured, latest, categories } = await getHomepage();

  if (!featured) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-24 text-center sm:px-6 lg:px-8">
        <h1 className="font-display text-4xl font-bold tracking-tight">
          No stories yet
        </h1>
        <p className="mt-4 text-fg-muted">
          Published articles will appear here. Add some from the admin panel.
        </p>
      </main>
    );
  }

  type Block = {
    key: string;
    title: string;
    href?: string;
    articles: ArticleWithCategory[];
  };
  const blocks: Block[] = [
    ...(latest.length > 0
      ? [{ key: "latest", title: "Latest News", articles: latest }]
      : []),
    ...categories
      .filter((c) => c.articles.length > 0)
      .map((c) => ({
        key: c.id,
        title: c.name,
        href: `/category/${c.slug}`,
        articles: c.articles,
      })),
  ];

  return (
    <div>
      <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8">
        <FeaturedHero article={featured} />
      </section>

      {blocks.map((block, idx) => (
        <section
          key={block.key}
          className={`py-10 sm:py-12 ${idx % 2 === 1 ? "bg-surface-2/50" : ""}`}
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <SectionHeader title={block.title} href={block.href} />
            </Reveal>
            <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
              {block.articles.map((article, i) => (
                <Reveal key={article.id} delay={Math.min(i, 4) * 55}>
                  <ArticleCard article={article} priority={idx === 0 && i < 4} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
