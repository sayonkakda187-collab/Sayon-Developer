import { prisma } from "@/lib/db";
import { parsePageIds } from "@/lib/publish";
import { ScheduledManager } from "@/components/admin/ScheduledManager";
import { ToastProvider } from "@/components/admin/Toast";

export const dynamic = "force-dynamic";

export default async function ScheduledPage() {
  const rows = await prisma.article.findMany({
    where: { status: "scheduled" },
    orderBy: { scheduledAt: "asc" },
    select: { id: true, title: true, scheduledAt: true, autoSharePageIds: true, scheduleSource: true, category: { select: { name: true } } },
  });
  const items = rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category?.name ?? null,
    scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : null,
    shareCount: parsePageIds(r.autoSharePageIds).length,
    source: r.scheduleSource ?? null,
  }));
  return (
    <ToastProvider>
      <ScheduledManager items={items} />
    </ToastProvider>
  );
}
