import Link from "next/link";
import { LiveAudienceDashboard } from "@/components/admin/LiveAudienceDashboard";
import { listGalleries } from "@/lib/galleries";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function GalleriesLivePage() {
  const galleries = await listGalleries();
  return (
    <div>
      <div className="adm-page-h">
        <h1>Live audience</h1>
        <p>
          Who&apos;s viewing your private galleries right now, in real time — a live reader count and graph over
          the last hour, with a per-gallery breakdown. Updates automatically.
        </p>
      </div>
      <div className="mb-4">
        <Link href="/admin/galleries" className="adm-link text-sm font-semibold">
          ← Back to galleries
        </Link>
      </div>
      <LiveAudienceDashboard
        galleries={galleries.map((g) => ({ token: g.token, title: g.title, enabled: g.enabled }))}
        baseUrl={siteConfig.url}
      />
    </div>
  );
}
