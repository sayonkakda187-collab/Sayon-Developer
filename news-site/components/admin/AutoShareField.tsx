"use client";

import { useEffect, useMemo, useState } from "react";
import { sortCategoryGroups } from "@/lib/facebookGroups";

export type AutoSharePage = {
  id: string;
  pageName: string;
  categoryGroup: string;
  status: string;
};

const LS_ON = "fb.autoShare.on";
const LS_PAGES = "fb.autoShare.pages";

/**
 * "Auto-share to Facebook on publish" control for the article editor. Renders a
 * toggle (default ON) + a filterable, grouped list of CONNECTED Pages. It submits
 * with the editor form: `fbAutoShare=on` + one `fbAutoSharePageIds` per selected
 * page. Selected ids go out as hidden inputs (not the visible checkboxes) so the
 * search filter can never drop a selected page from the submission. The toggle +
 * last selection persist per browser. `active=false` (preview/dev) only adds a
 * note — the real skip happens server-side in saveArticle.
 */
export function AutoShareField({ pages, active }: { pages: AutoSharePage[]; active: boolean }) {
  const [enabled, setEnabled] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  useEffect(() => {
    try {
      if (localStorage.getItem(LS_ON) === "0") setEnabled(false);
      const raw = localStorage.getItem(LS_PAGES);
      if (raw) {
        const ids = JSON.parse(raw) as string[];
        const valid = ids.filter((id) => pages.some((p) => p.id === id));
        if (valid.length) setSelected(new Set(valid));
      }
    } catch {
      /* localStorage unavailable — fall back to defaults */
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_ON, enabled ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [enabled]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_PAGES, JSON.stringify([...selected]));
    } catch {
      /* ignore */
    }
  }, [selected]);

  const connected = useMemo(() => pages.filter((p) => p.status === "Connected"), [pages]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return connected;
    return connected.filter(
      (p) => p.pageName.toLowerCase().includes(q) || p.categoryGroup.toLowerCase().includes(q),
    );
  }, [connected, query]);
  const grouped = useMemo(() => {
    const m = new Map<string, AutoSharePage[]>();
    for (const p of filtered) {
      const a = m.get(p.categoryGroup) ?? [];
      a.push(p);
      m.set(p.categoryGroup, a);
    }
    return sortCategoryGroups([...m.keys()]).map((g) => ({ group: g, rows: m.get(g)! }));
  }, [filtered]);

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleGroup(rows: AutoSharePage[], on: boolean) {
    setSelected((prev) => {
      const n = new Set(prev);
      for (const r of rows) {
        if (on) n.add(r.id);
        else n.delete(r.id);
      }
      return n;
    });
  }

  const selectedNames = pages.filter((p) => selected.has(p.id)).map((p) => p.pageName);

  return (
    <div>
      <span className="block text-sm font-medium text-fg-muted">Auto-share to Facebook</span>

      <label className="adm-check" style={{ marginTop: 8 }}>
        <input
          type="checkbox"
          name="fbAutoShare"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span>Share to the selected Pages when this is published</span>
      </label>

      {/* Submit selected ids via hidden inputs — independent of the search filter. */}
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="fbAutoSharePageIds" value={id} />
      ))}

      {enabled && (
        <>
          {!active && (
            <p className="adm-field-hint" style={{ marginTop: 6 }}>
              Runs on <strong>production</strong> only — publishing from this preview won’t post.
            </p>
          )}
          {connected.length === 0 ? (
            <p className="adm-field-hint" style={{ marginTop: 6 }}>
              No connected Pages yet. Connect Pages on the Facebook tab first.
            </p>
          ) : (
            <>
              <input
                className="adm-input"
                style={{ marginTop: 8 }}
                placeholder="Filter pages…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Filter Facebook pages"
              />
              <div className="adm-field-hint" style={{ marginTop: 6 }}>
                {selected.size === 0
                  ? "No pages selected — nothing will be shared."
                  : `${selected.size} selected: ${selectedNames.slice(0, 3).join(", ")}${selected.size > 3 ? "…" : ""}`}
              </div>
              <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border p-2">
                {grouped.length === 0 ? (
                  <p className="text-xs text-fg-faint">No pages match “{query}”.</p>
                ) : (
                  grouped.map(({ group, rows }) => {
                    const allOn = rows.every((r) => selected.has(r.id));
                    return (
                      <fieldset key={group} style={{ border: 0, margin: 0, padding: 0 }}>
                        <legend style={{ padding: 0 }}>
                          <button
                            type="button"
                            className="adm-fb-grouptoggle"
                            onClick={() => toggleGroup(rows, !allOn)}
                          >
                            {group} ({rows.length})
                          </button>
                        </legend>
                        {rows.map((p) => (
                          <label key={p.id} className="adm-check">
                            <input
                              type="checkbox"
                              checked={selected.has(p.id)}
                              onChange={() => toggle(p.id)}
                            />
                            <span>{p.pageName}</span>
                          </label>
                        ))}
                      </fieldset>
                    );
                  })
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
