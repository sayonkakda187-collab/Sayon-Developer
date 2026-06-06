"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setActiveSite } from "@/app/admin/site-actions";
import { GlobeIcon } from "@/components/admin/icons";

type SiteOption = { id: string; name: string; isDefault: boolean };

/**
 * Admin site switcher — picks which site you're managing (persists to a cookie,
 * then refreshes so the admin scopes to it). One site for now, so it's a single
 * read-only label until you add more.
 */
export function SiteSwitcher({ sites, activeSiteId }: { sites: SiteOption[]; activeSiteId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (!sites.length) return null;

  return (
    <label className="adm-siteswitch" title="Site you’re managing">
      <GlobeIcon className="h-4 w-4" aria-hidden />
      <select
        value={activeSiteId}
        aria-label="Active site"
        disabled={pending || sites.length < 2}
        onChange={(e) => {
          const id = e.target.value;
          startTransition(async () => {
            await setActiveSite(id);
            router.refresh();
          });
        }}
      >
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.isDefault ? " (default)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
