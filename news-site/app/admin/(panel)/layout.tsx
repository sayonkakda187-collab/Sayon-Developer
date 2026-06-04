import { requireAdmin } from "@/lib/auth";
import { getDefaultAiModel } from "@/lib/aiSettings";
import { AdminShell } from "@/components/admin/AdminShell";
import { AiModelSeed } from "@/components/admin/AiModelSeed";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, defaultModel] = await Promise.all([requireAdmin(), getDefaultAiModel()]);
  return (
    <AdminShell userEmail={user.email} avatarUrl={user.avatarUrl}>
      <AiModelSeed serverDefault={defaultModel} />
      {children}
    </AdminShell>
  );
}
