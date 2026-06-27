import { Suspense } from "react";
import { getCategories, getTrending } from "@/lib/queries";
import { deskClass } from "@/lib/ledger";
import { AdsHead } from "@/components/AdsHead";
import { AdNotification } from "@/components/AdNotification";
import { ADS } from "@/lib/ads";
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
  const [categories, trending] = await Promise.all([getCategories(), getTrending(8)]);

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
      {/* AdsKeeper in-site notification — a floating overlay, rendered once so it can
          appear on every public page (home + articles); positions itself per its
          dashboard settings and only fills on the authorized production domain. */}
      <AdNotification widgetId={ADS.NOTIFICATION} />
      <BreakingBanner />
      <Ticker items={tickerItems} />
      <Masthead today={today} nav={nav} />
      {/* Markets strip under the header. Streams in (Suspense) so a slow/failed
          markets fetch never delays the page; it hides itself when empty. */}
      <Suspense fallback={null}>
        <MarketsTicker />
      </Suspense>
      <div className="flex-1">{children}</div>
      <LedgerNewsletter />
      <LedgerFooter sections={sections} />
    </>
  );
}
