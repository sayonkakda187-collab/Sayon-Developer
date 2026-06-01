"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/admin/Toast";
import { saveNewsApiKey, chooseNewsProvider } from "@/app/admin/settings-actions";
import { KeyIcon, CheckIcon } from "@/components/admin/icons";

type Status = {
  id: "serpapi" | "newsapi";
  label: string;
  site: string;
  envVar: string;
  paidNote: string;
  source: "db" | "env" | "none";
  configured: boolean;
};

/**
 * API Settings UI: choose the active News Search provider and paste/save each
 * provider's API key. Keys are sent to a server action, encrypted at rest, and
 * NEVER returned here — this UI only shows configured/not-configured status.
 */
export function NewsApiSettings({
  statuses,
  activeProvider,
}: {
  statuses: Status[];
  activeProvider: "serpapi" | "newsapi";
}) {
  const { success, error } = useToast();
  const [active, setActive] = useState(activeProvider);
  const [pending, startTransition] = useTransition();

  function pickProvider(id: "serpapi" | "newsapi") {
    if (id === active) return;
    setActive(id);
    startTransition(async () => {
      const res = await chooseNewsProvider(id);
      if (res.ok) success(`Active provider: ${id === "serpapi" ? "SerpApi" : "NewsAPI"}.`);
      else {
        setActive(activeProvider);
        error(res.error ?? "Couldn’t switch provider.");
      }
    });
  }

  return (
    <div className="adm-settings">
      {/* Honesty / cost note. */}
      <div className="adm-trend-note" role="note" style={{ marginBottom: 16 }}>
        <span className="adm-trend-note-ic" aria-hidden><KeyIcon className="h-[18px] w-[18px]" /></span>
        <p>
          <strong>These are paid news APIs.</strong> SerpApi has a small free trial (~100 searches),
          then it’s paid. NewsAPI’s free tier is <strong>development-only</strong> (not allowed on a
          live site) — production needs its paid plan. The existing free <strong>Trending News</strong>{" "}
          (GNews + aggregated free APIs) stays available; free options like NewsData.io / TheNewsAPI
          live there too.
        </p>
      </div>

      {/* Active provider selector. */}
      <div className="adm-card adm-card-pad" style={{ marginBottom: 16 }}>
        <div className="adm-card-title">Active provider for News Search</div>
        <div className="adm-card-sub" style={{ marginBottom: 12 }}>Which provider powers the keyword/category/region search on the Trending page.</div>
        <div className="adm-seg" role="tablist" aria-label="Active provider">
          {statuses.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active === s.id}
              className={`adm-seg-btn ${active === s.id ? "on" : ""}`}
              onClick={() => pickProvider(s.id)}
              disabled={pending}
            >
              {s.label}
              {s.configured && <span className="adm-seg-ok" title="Key configured"><CheckIcon className="h-3 w-3" /></span>}
            </button>
          ))}
        </div>
      </div>

      {/* Per-provider key forms. */}
      <div className="adm-settings-grid">
        {statuses.map((s) => (
          <ProviderKeyCard key={s.id} status={s} onSaved={success} onError={error} />
        ))}
      </div>
    </div>
  );
}

function ProviderKeyCard({
  status,
  onSaved,
  onError,
}: {
  status: Status;
  onSaved: (m: string) => void;
  onError: (m: string) => void;
}) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [savedSource, setSavedSource] = useState(status.source);

  function save(clear = false) {
    startTransition(async () => {
      const res = await saveNewsApiKey(status.id, clear ? "" : value);
      if (res.ok) {
        setValue("");
        // After saving → DB key active. After clearing → fall back to env if the
        // server reported one was present originally, else none.
        setSavedSource(clear ? (status.source === "env" ? "env" : "none") : "db");
        onSaved(clear ? `${status.label} key cleared.` : `${status.label} key saved (encrypted).`);
      } else {
        onError(res.error);
      }
    });
  }

  const statusLabel =
    savedSource === "db" ? "Saved in database (encrypted)"
      : savedSource === "env" ? `From ${status.envVar} (env)`
        : "Not set";

  return (
    <div className="adm-card adm-card-pad">
      <div className="adm-settings-head">
        <div>
          <div className="adm-card-title">{status.label}</div>
          <a className="adm-link" href={`https://${status.site}`} target="_blank" rel="noopener noreferrer">{status.site}</a>
        </div>
        <span className={`adm-keypill ${savedSource !== "none" ? "on" : ""}`}>
          {savedSource !== "none" && <CheckIcon className="h-3 w-3" />}
          {statusLabel}
        </span>
      </div>

      <p className="adm-settings-note">{status.paidNote}</p>

      <label className="adm-field" style={{ marginTop: 10 }}>
        <span>API key</span>
        <input
          className="adm-input"
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={savedSource === "db" ? "•••••••• (saved) — paste to replace" : "Paste your API key"}
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <div className="adm-settings-actions">
        <button type="button" className="adm-btn-primary" onClick={() => save(false)} disabled={pending || value.trim().length < 4}>
          {pending ? <span className="adm-spinner" aria-hidden /> : null}
          Save key
        </button>
        {savedSource === "db" && (
          <button type="button" className="adm-btn-ghost" onClick={() => save(true)} disabled={pending}>
            Clear
          </button>
        )}
      </div>
      <p className="adm-field-hint" style={{ marginTop: 8 }}>
        Or set <code className="adm-fb-code">{status.envVar}</code> in Vercel (Production + Preview). A saved DB key takes priority over the env var.
      </p>
    </div>
  );
}
