import { getCountryStats, getDeviceStats, getAudienceArticles } from "@/lib/queries";
import { AudienceDashboard } from "@/components/admin/AudienceDashboard";

// Live visitor counts; never statically cache.
export const dynamic = "force-dynamic";

export default async function AdminAudiencePage() {
  // Overall, all-time by default; the client re-fetches on scope/range change.
  const [{ stats, total }, devices, articles] = await Promise.all([
    getCountryStats(),
    getDeviceStats(),
    getAudienceArticles(),
  ]);

  return (
    <AudienceDashboard
      initialStats={stats.map((s) => ({ countryCode: s.countryCode, count: s.count }))}
      initialTotal={total}
      initialDevices={devices.stats.map((d) => ({ device: d.device, count: d.count }))}
      initialDeviceTotal={devices.total}
      articles={articles}
    />
  );
}
