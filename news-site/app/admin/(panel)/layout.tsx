import { requireAdmin } from "@/lib/auth";
import { getDefaultAiModel } from "@/lib/aiSettings";
import { AdminShell } from "@/components/admin/AdminShell";
import { AiModelSeed } from "@/components/admin/AiModelSeed";
import { listSites, getActiveSiteId } from "@/lib/sites";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, defaultModel, sites, activeSiteId] = await Promise.all([
    requireAdmin(),
    getDefaultAiModel(),
    listSites(),
    getActiveSiteId(),
  ]);
  return (
    <AdminShell
      userEmail={user.email}
      avatarUrl={user.avatarUrl}
      sites={sites.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault }))}
      activeSiteId={activeSiteId}
    >
      <AiModelSeed serverDefault={defaultModel} />
      {children}
    </AdminShell>
  );
}
