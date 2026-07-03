import { ToastProvider } from "@/components/admin/Toast";
import { GalleriesManager } from "@/components/admin/GalleriesManager";
import { listGalleries } from "@/lib/galleries";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function AdminGalleriesPage() {
  const galleries = await listGalleries();
  return (
    <div>
      <div className="adm-page-h">
        <h1>Private Galleries</h1>
        <p>
          Unlisted image galleries at a secret link. Not indexed, kept out of the
          sitemap, and linked nowhere — normal browsing never reaches them. Share
          the link directly with the people who should see it.
        </p>
      </div>
      <ToastProvider>
        <GalleriesManager galleries={galleries} baseUrl={siteConfig.url} />
      </ToastProvider>
    </div>
  );
}
