import { Suspense } from "react";
import { getNavCategories, getTrendingCached } from "@/lib/queries";
import { deskClass } from "@/lib/ledger";
import { AdsHead } from "@/components/AdsHead";
import { AdOverlay } from "@/components/AdOverlay";
import { AdStickyFooter } from "@/components/AdStickyFooter";
import { AdSlot } from "@/components/AdSlot";
import { headers } from "next/headers";
import { adsForHost } from "@/lib/ads";
import { AdsterraScripts } from "@/components/AdsterraScripts";
import { AdsterraBanner } from "@/components/AdsterraBanner";
import { BANNERS } from "@/lib/adsterra";
import { BreakingBanner } from "@/components/BreakingBanner";
import { Ticker } from "@/components/ledger/Ticker";
import { MarketsTicker } from "@/components/ledger/MarketsTicker";
import { Masthead } from "@/components/ledger/Masthead";
import { LedgerNewsletter } from "@/components/ledger/LedgerNewsletter";
import { LedgerFooter } from "@/components/ledger/LedgerFooter";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [categories, trending] = await Promise.all([getNavCategories(), getTrendingCached(8)]);
  // AdsKeeper site + widget set for THIS domain (each domain is its own
  // registered site, with its own loader and its own widget ids).
  const { ads } = adsForHost(headers().get("host"));

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const nav = [
    { name: "Home", href: "/", deskCls: "" },
    ...categories.map((c) => ({
      name: c.name,
      href: `/category/${c.slug}`,
      deskCls: deskClass(c.name),
    })),
  ];
  const tickerItems = trending.map((t) => ({ title: t.title, href: `/news/${t.slug}` }));
  const sections = categories.map((c) => ({ name: c.name, href: `/category/${c.slug}` }));

  return (
    <>
      <AdsHead />
      {/* Adsterra self-displaying units (Social Bar / Popunder / In-Page Push).
          Independent of AdsKeeper above; each emits nothing until its src is set
          in lib/adsterra.ts and ADSTERRA_ENABLED is true. */}
      <AdsterraScripts />
      {/* Slim, dismissible sticky footer bar holding an IAB display banner —
          rendered once so it rides along on every public page; reveals only once
          the ad fills and only on the authorized production domain. */}
      <AdStickyFooter widgetId={ads.STICKY_FOOTER} />
      <BreakingBanner />
      <Ticker items={tickerItems} />
      <Masthead today={today} nav={nav} />
      {/* Markets strip under the header. Streams in (Suspense) so a slow/failed
          markets fetch never delays the page; it hides itself when empty. */}
      <Suspense fallback={null}>
        <MarketsTicker />
      </Suspense>
      <div className="flex-1">{children}</div>
      {/* Site-wide in-content Feed unit — renders once near the bottom of every
          public page (home / article / category / search). Collapses if unfilled. */}
      <div className="px-4 sm:px-6">
        <AdSlot widgetId={ads.SITEWIDE_FEED} minHeight={120} />
        {/* Adsterra fixed-size footer banner — reserves its exact size so it
            never shifts the layout, and renders nothing until configured. */}
        <AdsterraBanner banner={BANNERS.FOOTER} />
      </div>
      <LedgerNewsletter />
      <LedgerFooter sections={sections} />
      {/* AdsKeeper self-displaying overlays — the floating in-site notification and
          the click-triggered interstitials. Rendered once so they ride along on
          every public page (home + articles); each positions and triggers ITSELF
          per its dashboard settings.
          ⚠️ MOUNTED LAST ON PURPOSE. These are plain containers in normal flow.
          When they sat at the TOP of the layout, an overlay that AdsKeeper filled
          INLINE (rather than repositioning) rendered above the ticker and masthead
          and pushed the whole site down — an ad appearing "above the article".
          Anything that positions itself doesn't care where its container lives, so
          keeping them after the footer costs those formats nothing and confines an
          inline render to the very bottom of the page. Do not move these back up. */}
      <AdOverlay widgetId={ads.NOTIFICATION} />
      <AdOverlay widgetId={ads.INTERSTITIAL} />
      <AdOverlay widgetId={ads.INTERSTITIAL_2} />
    </>
  );
}
