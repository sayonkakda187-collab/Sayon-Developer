import { getHomepage } from "@/lib/queries";
import { FeaturedHero } from "@/components/FeaturedHero";
import { HomeFeed } from "@/components/HomeFeed";
import { AdSlot } from "@/components/AdSlot";
import { ADS } from "@/lib/ads";

export default async function Home() {
  const { featured, feed, tabCategories } = await getHomepage();

  if (!featured) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-24 text-center sm:px-6 lg:px-8">
        <h1 className="font-display text-4xl font-bold tracking-tight">No stories yet</h1>
        <p className="mt-4 text-fg-muted">
          Published articles will appear here. Add some from the admin panel.
        </p>
      </main>
    );
  }

  return (
    <div>
      {/* Top-of-page ad — the first thing visitors see on landing, above the
          lead story. Collapses cleanly if unfilled (needs its own HOME widget
          id in lib/ads.ts to fill). */}
      <section className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
        <AdSlot name="HOME" widgetId={ADS.HOME} minHeight={110} />
      </section>

      {/* Lead story. */}
      <section className="mx-auto max-w-7xl px-4 pt-2 sm:px-6 sm:pt-4 lg:px-8">
        <FeaturedHero article={featured} />
      </section>

      {/* Trending-style: search + category tabs + responsive card grid. */}
      <HomeFeed articles={feed} categories={tabCategories} />
    </div>
  );
}
