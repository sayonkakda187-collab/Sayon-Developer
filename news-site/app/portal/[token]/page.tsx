import { prisma } from "@/lib/db";
import { managerForPortalToken } from "@/lib/managerPortal";
import { portalPageRateLimited } from "@/lib/portalAuth";
import { type MonitoredRow } from "@/components/admin/PageControlList";
import type { Manager } from "@/components/admin/ManagerAvatar";
import type { ManagedPage } from "@/components/admin/ManagersScreen";
import { PortalClient } from "./PortalClient";
import { PortalExpired } from "./PortalExpired";

// The token gates everything; never statically cache.
export const dynamic = "force-dynamic";

/**
 * Manager Portal magic link — `/portal/<token>`.
 *
 * The token is resolved to its ENABLED manager server-side (a disabled or regenerated
 * token resolves to null → the clean "link expired" page, never a login form). A valid
 * token renders a STANDALONE, read-only Page Control view: all pages' results +
 * network dashboard, and earnings entry limited to THIS manager's own pages (the portal
 * API re-checks ownership on every write).
 */
export default async function PortalPage({ params }: { params: { token: string } }) {
  // Throttle full-page renders by IP (defence-in-depth against hammering the link).
  if (portalPageRateLimited()) return <PortalExpired variant="rate" />;

  const manager = await managerForPortalToken(params.token);
  if (!manager) return <PortalExpired />;

  const [pages, managerRecords] = await Promise.all([
    prisma.monitoredPage.findMany({ orderBy: { pageName: "asc" } }),
    prisma.pageManager.findMany({ orderBy: { name: "asc" } }),
  ]);

  const rows: MonitoredRow[] = pages.map((p) => ({
    id: p.id,
    pageId: p.pageId,
    pageName: p.pageName,
    categoryGroup: "Monitored",
    status: p.status,
    avatarUrl: p.avatarUrl,
    postedCount: 0,
    lastSharedAt: null,
    followers: p.followers,
    managerId: p.managerId,
  }));

  // A read-only directory of managers (for the network dashboard's chips + row badges).
  // Deliberately carries NO link codes or portal tokens — those never reach the portal.
  const managers: Manager[] = managerRecords.map((m) => ({ id: m.id, name: m.name, photo: m.photo }));
  const assignments: Record<string, string | null> = Object.fromEntries(pages.map((p) => [p.id, p.managerId ?? null]));

  // Earnings entry is limited to THIS manager's own pages (the portal API enforces it too).
  const ownPages: ManagedPage[] = rows
    .filter((p) => p.managerId === manager.id)
    .map((p) => ({ id: p.id, name: p.pageName, avatarUrl: p.avatarUrl }));
  const ownAssignments: Record<string, string | null> = Object.fromEntries(ownPages.map((p) => [p.id, manager.id]));
  const selfManager: Manager = { id: manager.id, name: manager.name, photo: manager.photo };

  return (
    <PortalClient
      token={params.token}
      manager={selfManager}
      pages={rows}
      managers={managers}
      assignments={assignments}
      ownPages={ownPages}
      ownAssignments={ownAssignments}
    />
  );
}
