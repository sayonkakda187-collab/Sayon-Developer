import { getHomepage } from "@/lib/queries";
import { toLedgerStory } from "@/lib/ledger";
import { LedgerHero } from "@/components/ledger/LedgerHero";
import { Latest } from "@/components/ledger/Latest";
import { MostRead } from "@/components/MostRead";
import { AdSlot } from "@/components/AdSlot";
import { AdSenseSlot } from "@/components/AdSenseSlot";
import { ADS } from "@/lib/ads";
import { adsenseEnabled } from "@/lib/adsense";

// Desk order used when a category is present (others append alphabetically).
const DESK_ORDER = ["Business", "Sports", "Technology", "World"];

export default async function Home() {
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
  const adsOn = await adsenseEnabled();

  // Filter pills = "Top" + the desks actually present in the pool.
  const present = Array.from(new Set(pool.map((s) => s.cat)));
  const filters = [
    "Top",
    ...DESK_ORDER.filter((d) => present.includes(d)),
    ...present.filter((p) => !DESK_ORDER.includes(p)).sort(),
  ];

  return (
    <main className="tl-wrap tl-home">
      <LedgerHero hero={hero} leads={leads} />

      {/* Most Read — top stories by views over the last 7 days (cached ~15 min). */}
      <MostRead />

      {/* AdsKeeper HOME unit — kept for revenue; collapses cleanly when unfilled. */}
      <div style={{ padding: "28px 0" }}>
        <AdSlot name="HOME" widgetId={ADS.HOME} minHeight={120} />
      </div>

      {/* Reserved Google AdSense slot between the upper sections and the feed. */}
      <AdSenseSlot enabled={adsOn} slot="home-mid" className="max-w-3xl" />

      <Latest stories={pool} filters={filters} />
    </main>
  );
}
