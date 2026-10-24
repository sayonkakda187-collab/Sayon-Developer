import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGallery } from "@/lib/galleries";
import { GalleryView } from "@/components/GalleryView";
import { GalleryPresence } from "@/components/GalleryPresence";

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

      {/* Invisible: heartbeats live-viewer presence so the admin sees who's watching. */}
      <GalleryPresence token={params.token} />

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <GalleryView title={gallery.title} images={gallery.images} videos={gallery.videos} />
      </main>
    </div>
  );
}
