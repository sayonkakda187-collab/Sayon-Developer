"use client";

import { useState } from "react";
import { useToast } from "@/components/admin/Toast";
import { CheckIcon } from "@/components/admin/icons";
import { formatDay } from "@/lib/fbInsightsRange";
import type { ManagedPage } from "@/components/admin/ManagersScreen";

type Row = { date: string; amount: number };
type Preview = { pageName: string; rows: Row[]; unparsed: string[]; truncated: boolean };
type Phase = "edit" | "preview" | "saved";

const BLUE = "var(--chart-1)";

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Manager Portal — bulk "paste daily earnings" for the manager's OWN pages. A clean
 * 3-step flow: pick a page → paste a list (copied from Meta) → Preview (server parses
 * into a (date, amount) table, flags unreadable lines) → Approve & save. Every call hits
 * the token-gated `/earnings/bulk` route, which RE-VERIFIES the page belongs to this
 * manager (403 otherwise) and parses server-side — so the page choice + amounts are never
 * trusted from the client. On save it bumps the editor below (`onSaved`) to reflect values.
 */
export function PortalPasteEarnings({ pages, apiBase, onSaved }: { pages: ManagedPage[]; apiBase: string; onSaved?: () => void }) {
  const { error } = useToast();
  const [pageId, setPageId] = useState<string>(pages.length === 1 ? pages[0].id : "");
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("edit");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saved, setSavedResult] = useState<{ pageName: string; count: number } | null>(null);

  const selectedName = pages.find((p) => p.id === pageId)?.name ?? "";

  async function call(commit: boolean) {
    if (!pageId) return error("Pick a page first.");
    if (!text.trim()) return error("Paste your daily earnings first.");
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/earnings/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitoredPageId: pageId, text, commit }),
      });
      const j = await res.json();
      if (!j.ok) {
        error(j.error || "Couldn’t process that — try again.");
        return null;
      }
      return j as { pageName: string; rows: Row[]; unparsed: string[]; truncated: boolean; saved?: number };
    } catch {
      error("Couldn’t reach the server — try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function onPreview() {
    const j = await call(false);
    if (!j) return;
    if (j.rows.length === 0) {
      error("Couldn’t read any dates — check the format, e.g. “Jun 1: $14.91”.");
      return;
    }
    setPreview({ pageName: j.pageName, rows: j.rows, unparsed: j.unparsed, truncated: j.truncated });
    setPhase("preview");
  }

  async function onApprove() {
    const j = await call(true);
    if (!j) return;
    setSavedResult({ pageName: j.pageName, count: j.saved ?? j.rows.length });
    setPhase("saved");
    onSaved?.();
  }

  function resetAll() {
    setText("");
    setPreview(null);
    setSavedResult(null);
    setPhase("edit");
  }

  const total = preview ? preview.rows.reduce((s, r) => s + r.amount, 0) : 0;

  return (
    <section className="adm-card adm-card-pad" style={{ marginBottom: 14 }}>
      <div className="adm-card-title" style={{ fontSize: 15 }}>Paste daily earnings</div>
      <p className="adm-card-sub" style={{ marginTop: 2 }}>
        Paste a list copied from Meta — one day per line or inline (e.g. <code>Jun 1: $14.91, Jun 2: $12.30</code>). Preview, then approve to save.
      </p>

      {phase === "saved" && saved ? (
        <div style={{ marginTop: 14 }}>
          <div className="adm-pill" style={{ background: "rgba(21,128,61,.14)", color: "#15803d", fontWeight: 700 }}>
            <CheckIcon className="h-4 w-4" /> Saved {saved.count} {saved.count === 1 ? "day" : "days"} for {saved.pageName}
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="button" className="adm-btn-ghost" onClick={resetAll}>Paste more</button>
          </div>
        </div>
      ) : (
        <>
          {/* Step 1 — page */}
          <label className="adm-field" style={{ marginTop: 14 }}>
            <span>Page</span>
            {pages.length === 1 ? (
              <input className="adm-input" value={pages[0].name} disabled readOnly />
            ) : (
              <select className="adm-input" value={pageId} onChange={(e) => setPageId(e.target.value)} disabled={busy || phase === "preview"} aria-label="Pick one of your pages">
                <option value="">Select a page…</option>
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </label>

          {/* Step 2 — paste */}
          <label className="adm-field" style={{ marginTop: 4 }}>
            <span>Daily earnings</span>
            <textarea
              className="adm-input"
              rows={6}
              value={text}
              disabled={busy || phase === "preview"}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Jun 1: $14.91\nJun 2: $12.30\nJun 3: $9.04"}
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, resize: "vertical" }}
            />
          </label>

          {/* Step 3 — preview table */}
          {phase === "preview" && preview && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div className="adm-card-title" style={{ fontSize: 13 }}>
                  Preview · <span style={{ color: BLUE }}>{preview.rows.length}</span> {preview.rows.length === 1 ? "day" : "days"} for {selectedName || preview.pageName}
                </div>
                <div style={{ fontWeight: 800, color: BLUE, fontVariantNumeric: "tabular-nums" }}>{money(total)} <span className="adm-card-sub" style={{ fontWeight: 600 }}>total</span></div>
              </div>

              <div style={{ overflowX: "auto", marginTop: 8 }}>
                <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--adm-bd)", borderRadius: 10 }}>
                  <table className="adm-table" style={{ marginTop: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ position: "sticky", top: 0, background: "var(--adm-card)" }}>Date</th>
                        <th style={{ position: "sticky", top: 0, background: "var(--adm-card)", textAlign: "right" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r) => (
                        <tr key={r.date}>
                          <td style={{ whiteSpace: "nowrap" }}>{formatDay(r.date)}</td>
                          <td className="adm-num-td" style={{ textAlign: "right", color: BLUE, fontWeight: 700 }}>{money(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {preview.truncated && (
                <p className="adm-fb-sub" style={{ marginTop: 8, color: "#b45309" }}>Only the first 200 days are shown/saved — paste the rest separately.</p>
              )}
              {preview.unparsed.length > 0 && (
                <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 10, background: "rgba(245,158,11,.12)", border: "1px solid rgba(245,158,11,.35)" }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, color: "#b45309" }}>{preview.unparsed.length} line{preview.unparsed.length === 1 ? "" : "s"} couldn’t be read (skipped):</div>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12 }}>
                    {preview.unparsed.slice(0, 8).map((u, i) => (
                      <li key={i} style={{ fontFamily: "ui-monospace, monospace", wordBreak: "break-word" }}>{u}</li>
                    ))}
                    {preview.unparsed.length > 8 && <li className="adm-card-sub">…and {preview.unparsed.length - 8} more</li>}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            {phase === "edit" ? (
              <button type="button" className="adm-btn-primary" disabled={busy || !pageId || !text.trim()} onClick={onPreview}>
                {busy && <span className="adm-spinner" aria-hidden />} Preview
              </button>
            ) : (
              <>
                <button type="button" className="adm-btn-primary" disabled={busy} onClick={onApprove}>
                  {busy && <span className="adm-spinner" aria-hidden />} Approve &amp; save{preview ? ` ${preview.rows.length}` : ""}
                </button>
                <button type="button" className="adm-btn-ghost" disabled={busy} onClick={() => setPhase("edit")}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
