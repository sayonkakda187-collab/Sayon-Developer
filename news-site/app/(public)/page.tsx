import Link from "next/link";
import { getHomepage } from "@/lib/queries";
import { FeaturedHero } from "@/components/FeaturedHero";
import { ArticleCard } from "@/components/ArticleCard";
import { Reveal } from "@/components/Reveal";

function SectionHeader({ title, href }: { title: string; href?: string }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="h-7 w-1.5 rounded-full bg-accent" aria-hidden />
        <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h2>
      </div>
      {href && (
        <Link
          href={href}
          className="shrink-0 text-sm font-semibold text-accent-link transition-colors hover:text-accent"
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
      <main className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6 lg:px-8">
        <h1 className="font-display text-4xl font-bold tracking-tight">
          No stories yet
        </h1>
        <p className="mt-4 text-fg-muted">
          Published articles will appear here. Add some from the admin panel.
        </p>
      </main>
    );
  }

  const sections = categories.filter((c) => c.articles.length > 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <FeaturedHero article={featured} />

      {latest.length > 0 && (
        <section className="mt-16 sm:mt-20">
          <Reveal>
            <SectionHeader title="Latest news" />
          </Reveal>
          <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {latest.map((article, i) => (
              <Reveal key={article.id} delay={Math.min(i, 5) * 70}>
                <ArticleCard article={article} priority={i < 3} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {sections.map((category) => (
        <section key={category.id} className="mt-16 sm:mt-20">
          <Reveal>
            <SectionHeader
              title={category.name}
              href={`/category/${category.slug}`}
            />
          </Reveal>
          <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {category.articles.map((article, i) => (
              <Reveal key={article.id} delay={Math.min(i, 5) * 70}>
                <ArticleCard article={article} />
              </Reveal>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
