import { getHomepage } from "@/lib/queries";
import { toLedgerStory } from "@/lib/ledger";
import { LedgerHero } from "@/components/ledger/LedgerHero";
import { Latest } from "@/components/ledger/Latest";
import { MostRead } from "@/components/MostRead";
import { AdSlot } from "@/components/AdSlot";
import { headers } from "next/headers";
import { adsForHost } from "@/lib/ads";

// Desk order used when a category is present (others append alphabetically).
const DESK_ORDER = ["Business", "Sports", "Technology", "World"];

export default async function Home() {
  // Widget set for THIS domain (each domain is its own AdsKeeper site).
  const { ads } = adsForHost(headers().get("host"));
  const { featured, feed } = await getHomepage();

  if (!featured) {
    return (
      <main className="tl-wrap tl-home">
        <h1 className="tl-section-title">No stories yet</h1>
        <p className="tl-section-sub">
          Published articles will appear here. Add some from the admin panel.
        </p>
      </main>
    );
  }

  const hero = toLedgerStory(featured);
  const leads = feed.slice(0, 2).map(toLedgerStory);
  const pool = feed.slice(2).map(toLedgerStory);

  // Filter pills = "Top" + the desks actually present in the pool.
  const present = Array.from(new Set(pool.map((s) => s.cat)));
  const filters = [
    "Top",
    ...DESK_ORDER.filter((d) => present.includes(d)),
    ...present.filter((p) => !DESK_ORDER.includes(p)).sort(),
  ];

  return (
    <main className="tl-wrap tl-home">
      {/* HEADER WIDGET — AdsKeeper types this unit "a responsive single-row ad
          unit that should be placed ABOVE the page content", so it sits at the
          very top of the homepage, ahead of the hero — the same relationship it
          has to the headline on an article page. */}
      <div style={{ paddingBottom: 28 }}>
        <AdSlot widgetId={ads.HOME} minHeight={120} />
      </div>

      <LedgerHero hero={hero} leads={leads} />

      {/* Most Read — top stories by views over the last 7 days (cached ~15 min). */}
      <MostRead />

      <Latest stories={pool} filters={filters} />
    </main>
  );
}
