"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/Toast";
import { createSite, deleteSite } from "@/app/admin/site-actions";
import { GlobeIcon, PlusIcon, TrashIcon } from "@/components/admin/icons";

type SiteRow = {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  isDefault: boolean;
  articleCount: number;
};

/** Sites list + "add a site" form. The default site is protected (no delete);
 *  a site with articles can't be deleted (nothing orphaned). */
export function SitesManager({ sites }: { sites: SiteRow[] }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [domain, setDomain] = useState("");
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function add() {
    startTransition(async () => {
      const res = await createSite({ name, slug, domain });
      if (res.ok) {
        success("Site created.");
        setName(""); setSlug(""); setDomain("");
        router.refresh();
      } else error(res.error);
    });
  }

  function remove(id: string, nm: string) {
    if (!confirm(`Delete site “${nm}”? (Only allowed if it has no articles.)`)) return;
    setBusyId(id);
    startTransition(async () => {
      const res = await deleteSite(id);
      setBusyId(null);
      if (res.ok) { success("Site deleted."); router.refresh(); }
      else error(res.error);
    });
  }

  return (
    <div className="adm-settings-stack">
      <div className="adm-card adm-card-pad">
        <div className="adm-card-title">Your sites</div>
        <div className="adm-card-sub" style={{ marginBottom: 12 }}>
          Each article belongs to a site. The <strong>default</strong> site is your current live site — all existing articles stay on it.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sites.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", border: "1px solid var(--adm-bd)", borderRadius: 12, background: "var(--adm-card)" }}>
              <span className="adm-qa-ic" style={{ background: "rgba(37,99,235,.12)", color: "#2563eb" }}>
                <GlobeIcon className="h-[18px] w-[18px]" />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "var(--adm-ink)" }}>
                  {s.name}
                  {s.isDefault && (
                    <span className="adm-pill" style={{ marginLeft: 8, color: "#16a34a", background: "rgba(22,163,74,.12)" }}>Default</span>
                  )}
                </div>
                <div className="adm-card-sub" style={{ marginTop: 2 }}>
                  /{s.slug}{s.domain ? ` · ${s.domain}` : " · no domain yet"} · {s.articleCount} article{s.articleCount === 1 ? "" : "s"}
                </div>
              </div>
              {!s.isDefault && (
                <button type="button" className="adm-btn-ghost adm-fb-act adm-fb-danger" disabled={pending && busyId === s.id} onClick={() => remove(s.id, s.name)} title="Delete site">
                  <TrashIcon className="h-4 w-4" />
                  <span className="adm-fb-actlabel">Delete</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="adm-card adm-card-pad">
        <div className="adm-card-title">Add a site</div>
        <div className="adm-card-sub" style={{ marginBottom: 12 }}>
          Creates a record for later. Domain routing + per-site branding/ads/Facebook aren’t wired yet — new articles you create belong to the site selected in the switcher.
        </div>
        <div className="adm-settings-grid">
          <label className="adm-field">
            <span>Name</span>
            <input className="adm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Phnom Penh Times" />
          </label>
          <label className="adm-field">
            <span>Slug <span className="adm-field-hint" style={{ display: "inline" }}>(optional — from name)</span></span>
            <input className="adm-input" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="phnom-penh-times" autoComplete="off" spellCheck={false} />
          </label>
          <label className="adm-field">
            <span>Domain <span className="adm-field-hint" style={{ display: "inline" }}>(optional, for later)</span></span>
            <input className="adm-input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" autoComplete="off" spellCheck={false} />
          </label>
        </div>
        <div className="adm-settings-actions">
          <button type="button" className="adm-btn-primary" onClick={add} disabled={pending || name.trim().length < 2}>
            {pending ? <span className="adm-spinner" aria-hidden /> : <PlusIcon className="h-4 w-4" />}
            Add site
          </button>
        </div>
      </div>
    </div>
  );
}
