import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdsHead } from "@/components/AdsHead";
import { AdOverlay } from "@/components/AdOverlay";
import { AdStickyFooter } from "@/components/AdStickyFooter";
import { ADS } from "@/lib/ads";
import { getGallery } from "@/lib/galleries";
import { GalleryView } from "@/components/GalleryView";

export const dynamic = "force-dynamic";

// Private + unlisted: never index, never cache in search. The page is also
// absent from sitemap.xml and disallowed in robots.txt, and linked nowhere — so
// it is reachable ONLY by someone who has the exact /g/<token> link.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default async function PrivateGalleryPage({
  params,
}: {
  params: { token: string };
}) {
  const gallery = await getGallery(params.token);
  // Unknown or disabled token → looks like it doesn't exist.
  if (!gallery || !gallery.enabled) notFound();

  return (
    <div className="min-h-screen">
      {/* AdsKeeper stack. This page is outside the (public) route group, so the
          loader + overlays are mounted here directly. All AdsKeeper (no third-
          party pop networks): the notification + interstitial are AdsKeeper's
          own alert/pop formats, plus the sticky footer and in-grid units in
          <GalleryView>. Same widget ids as the rest of the site — a different
          page, so they fill independently. Only serve on the authorized domain. */}
      <AdsHead />
      <AdOverlay widgetId={ADS.NOTIFICATION} />
      <AdOverlay widgetId={ADS.INTERSTITIAL} />
      <AdStickyFooter widgetId={ADS.STICKY_FOOTER} />

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <GalleryView title={gallery.title} images={gallery.images} />
      </main>
    </div>
  );
}
