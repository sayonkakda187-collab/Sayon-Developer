"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/Toast";
import { PageControlList, type MonitoredRow } from "@/components/admin/PageControlList";
import { PageControlNetwork } from "@/components/admin/PageControlNetwork";
import { ManagersScreen, type ManagedPage } from "@/components/admin/ManagersScreen";
import type { Manager } from "@/components/admin/ManagerAvatar";
import { createManager, updateManager, deleteManager, assignManager } from "@/app/admin/page-manager-actions";

const byName = (a: Manager, b: Manager) => a.name.localeCompare(b.name);

/**
 * Page Control's top-level sub-tabs: "Pages" (the existing monitored-pages list +
 * network dashboard, unchanged) and "Managers" (the team-member screen). This is the
 * single owner of the managers list + page→manager assignments: it runs the server
 * actions, updates local state optimistically for an instant feel, and revalidates so
 * the chips, counts and both tabs stay perfectly in sync. Defaults to "Pages".
 */
export function PageControlTabs({
  pages,
  appConfigured,
  managers: initialManagers,
}: {
  pages: MonitoredRow[];
  appConfigured: boolean;
  managers: Manager[];
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [tab, setTab] = useState<"pages" | "managers">("pages");
  const [managers, setManagers] = useState<Manager[]>(initialManagers);
  const [assignments, setAssignments] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(pages.map((p) => [p.id, p.managerId ?? null])),
  );

  // Reconcile optimistic state whenever the server sends fresh props (router.refresh()).
  useEffect(() => setManagers(initialManagers), [initialManagers]);
  useEffect(() => setAssignments(Object.fromEntries(pages.map((p) => [p.id, p.managerId ?? null]))), [pages]);

  async function onAssign(pageId: string, managerId: string | null): Promise<boolean> {
    const prev = assignments[pageId] ?? null;
    if (prev === managerId) return true;
    setAssignments((a) => ({ ...a, [pageId]: managerId })); // optimistic
    const res = await assignManager({ pageId, managerId });
    if (!res.ok) {
      setAssignments((a) => ({ ...a, [pageId]: prev }));
      error(res.error);
      return false;
    }
    success(managerId ? "Manager assigned." : "Manager unassigned.");
    router.refresh();
    return true;
  }

  async function onCreate({ name, photo }: { name: string; photo: string | null }): Promise<Manager | null> {
    const res = await createManager({ name, photo });
    if (!res.ok) {
      error(res.error);
      return null;
    }
    const m: Manager = { id: res.data.id, name: name.trim(), photo: photo ?? null };
    setManagers((ms) => [...ms, m].sort(byName));
    success("Manager added.");
    router.refresh();
    return m;
  }

  async function onUpdate(id: string, input: { name?: string; photo?: string | null }): Promise<boolean> {
    const res = await updateManager({ id, ...input });
    if (!res.ok) {
      error(res.error);
      return false;
    }
    setManagers((ms) =>
      ms
        .map((m) =>
          m.id === id
            ? { ...m, ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.photo !== undefined ? { photo: input.photo } : {}) }
            : m,
        )
        .sort(byName),
    );
    success("Manager updated.");
    router.refresh();
    return true;
  }

  async function onDelete(id: string): Promise<boolean> {
    const res = await deleteManager(id);
    if (!res.ok) {
      error(res.error);
      return false;
    }
    setManagers((ms) => ms.filter((m) => m.id !== id));
    setAssignments((a) => {
      const next = { ...a };
      for (const k of Object.keys(next)) if (next[k] === id) next[k] = null;
      return next;
    });
    success("Manager deleted.");
    router.refresh();
    return true;
  }

  const managedPages: ManagedPage[] = pages.map((p) => ({ id: p.id, name: p.pageName, avatarUrl: p.avatarUrl }));

  return (
    <div>
      <div className="adm-pc-subtabs adm-pc-toptabs" role="tablist" aria-label="Page Control sections">
        <button type="button" role="tab" aria-selected={tab === "pages"} className={`adm-pc-subtab ${tab === "pages" ? "on" : ""}`} onClick={() => setTab("pages")}>
          Pages
        </button>
        <button type="button" role="tab" aria-selected={tab === "managers"} className={`adm-pc-subtab ${tab === "managers" ? "on" : ""}`} onClick={() => setTab("managers")}>
          Managers
        </button>
      </div>

      {tab === "pages" ? (
        <div className="adm-pc-twobox">
          {/* LEFT box — the existing monitored-pages list (+ the new per-row manager chip). */}
          <div className="adm-pc-box">
            <PageControlList pages={pages} appConfigured={appConfigured} managers={managers} assignments={assignments} onAssign={onAssign} onCreate={onCreate} />
          </div>
          {/* RIGHT box — the network dashboard (unchanged). */}
          <div className="adm-pc-box">
            <PageControlNetwork />
          </div>
        </div>
      ) : (
        <ManagersScreen
          managers={managers}
          pages={managedPages}
          assignments={assignments}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onAssign={onAssign}
          onError={error}
        />
      )}
    </div>
  );
}
