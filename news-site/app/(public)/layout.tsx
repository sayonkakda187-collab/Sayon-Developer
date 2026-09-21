import { Suspense } from "react";
import { getNavCategories, getTrendingCached } from "@/lib/queries";
import { deskClass } from "@/lib/ledger";
import { BreakingBanner } from "@/components/BreakingBanner";
import { Ticker } from "@/components/ledger/Ticker";
import { MarketsTicker } from "@/components/ledger/MarketsTicker";
import { Masthead } from "@/components/ledger/Masthead";
import { LedgerNewsletter } from "@/components/ledger/LedgerNewsletter";
import { LedgerFooter } from "@/components/ledger/LedgerFooter";
import { AdsterraSocialBar } from "@/components/AdsterraSocialBar";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [categories, trending] = await Promise.all([getNavCategories(), getTrendingCached(8)]);
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
      {/* Last child of the layout, so it is the final thing in <body>. Adsterra
          Social Bar is self-positioning and loads afterInteractive — it never
          blocks the initial render. */}
      <AdsterraSocialBar />
    </>
  );
}
