"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { FacebookPageAvatar } from "@/components/admin/FacebookPageAvatar";
import { ManagerAvatar, type Manager } from "@/components/admin/ManagerAvatar";
import { CalendarIcon, CheckIcon, ChevronDownIcon } from "@/components/admin/icons";
import { useToast } from "@/components/admin/Toast";
import { ppToday, addDays, formatDay } from "@/lib/fbInsightsRange";
import type { ManagedPage } from "@/components/admin/ManagersScreen";

const API = "/api/admin/page-control/earnings";

type SaveStatus = "saving" | "ok" | "err";

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "Sat, Jun 14" for a Phnom-Penh YYYY-MM-DD. */
function fmtFull(date: string): string {
  try {
    return new Date(`${date}T00:00:00+07:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Phnom_Penh" });
  } catch {
    return date;
  }
}

function clearStatus(s: Record<string, SaveStatus>, key: string): Record<string, SaveStatus> {
  if (!(key in s)) return s;
  const n = { ...s };
  delete n[key];
  return n;
}

/**
 * Page Control "Earnings" tab — a web way to enter each page's daily earnings (the same
 * `PageEarning` rows the Telegram bot writes). Pick a Phnom-Penh day; every manager gets
 * a card listing their pages with a `$` input prefilled from what's saved for that day;
 * unassigned pages get a card at the bottom. Each input upserts on blur/Enter (re-entry
 * overwrites; clearing it removes the day's value). Desktop-first.
 */
export function PageControlEarnings({ pages, managers, assignments }: { pages: ManagedPage[]; managers: Manager[]; assignments: Record<string, string | null> }) {
  const { error } = useToast();
  const today = ppToday();
  const [date, setDate] = useState(today);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<Record<string, SaveStatus>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({}); // boxes collapsed by default

  // (Re)load the saved earnings whenever the day changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStatus({});
    setValues({});
    setSaved({});
    fetch(`${API}?date=${date}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const v: Record<string, string> = {};
        const s: Record<string, number> = {};
        if (j.ok) for (const e of j.earnings as { monitoredPageId: string; amount: number }[]) {
          v[e.monitoredPageId] = String(e.amount);
          s[e.monitoredPageId] = e.amount;
        }
        setValues(v);
        setSaved(s);
      })
      .catch(() => !cancelled && error("Couldn’t load earnings for that day."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date, error]);

  async function commit(pageId: string): Promise<void> {
    const raw = (values[pageId] ?? "").trim().replace(/[$,\s]/g, "");
    let amount: number | null;
    if (raw === "") {
      if (saved[pageId] === undefined) {
        setStatus((s) => clearStatus(s, pageId));
        return; // nothing saved, nothing to clear
      }
      amount = null;
    } else {
      if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
        setStatus((s) => ({ ...s, [pageId]: "err" }));
        return;
      }
      amount = Math.round(Number(raw) * 100) / 100;
      if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) {
        setStatus((s) => ({ ...s, [pageId]: "err" }));
        return;
      }
      if (saved[pageId] === amount) {
        setStatus((s) => clearStatus(s, pageId));
        return; // unchanged
      }
    }
    setStatus((s) => ({ ...s, [pageId]: "saving" }));
    try {
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monitoredPageId: pageId, date, amount }) });
      const j = await res.json();
      if (!j.ok) {
        setStatus((s) => ({ ...s, [pageId]: "err" }));
        error(j.error || "Couldn’t save.");
        return;
      }
      setSaved((s) => {
        const n = { ...s };
        if (amount === null) delete n[pageId];
        else n[pageId] = amount as number;
        return n;
      });
      setValues((v) => ({ ...v, [pageId]: amount === null ? "" : String(amount) }));
      setStatus((s) => ({ ...s, [pageId]: "ok" }));
      setTimeout(() => setStatus((s) => clearStatus(s, pageId)), 1600);
    } catch {
      setStatus((s) => ({ ...s, [pageId]: "err" }));
      error("Couldn’t save — try again.");
    }
  }

  const dayTotal = useMemo(() => Object.values(saved).reduce((s, n) => s + n, 0), [saved]);
  const dayCount = useMemo(() => Object.keys(saved).length, [saved]);
  const sortedManagers = useMemo(() => [...managers].sort((a, b) => a.name.localeCompare(b.name)), [managers]);
  const unassigned = useMemo(() => pages.filter((p) => !assignments[p.id]), [pages, assignments]);
  const allKeys = useMemo(() => [...sortedManagers.map((m) => m.id), ...(unassigned.length ? ["_unassigned"] : [])], [sortedManagers, unassigned]);
  const anyOpen = Object.values(expanded).some(Boolean);
  const toggleBox = (key: string) => setExpanded((e) => ({ ...e, [key]: !e[key] }));
  const setAll = (open: boolean) => setExpanded(open ? Object.fromEntries(allKeys.map((k) => [k, true])) : {});

  const boxTotal = (boxPages: ManagedPage[]) => boxPages.reduce((s, p) => s + (saved[p.id] ?? 0), 0);
  const boxFilled = (boxPages: ManagedPage[]) => boxPages.filter((p) => saved[p.id] !== undefined).length;

  function renderRow(p: ManagedPage) {
    const st = status[p.id];
    return (
      <div className="adm-pce-row" key={p.id}>
        <FacebookPageAvatar dbId={p.id} name={p.name} avatarUrl={p.avatarUrl} size={22} />
        <span className="adm-pce-pname">{p.name}</span>
        <span className={`adm-pce-field ${st === "err" ? "err" : ""}`}>
          <span className="adm-pce-cur">$</span>
          <input
            className="adm-pce-input"
            inputMode="decimal"
            placeholder="0.00"
            value={values[p.id] ?? ""}
            disabled={loading}
            aria-label={`Earnings for ${p.name} on ${fmtFull(date)}`}
            onChange={(e) => setValues((v) => ({ ...v, [p.id]: e.target.value }))}
            onBlur={() => void commit(p.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
            }}
          />
          <span className="adm-pce-status" aria-hidden>
            {st === "saving" ? <span className="adm-spinner" /> : st === "ok" ? <CheckIcon className="h-4 w-4" /> : st === "err" ? "!" : null}
          </span>
        </span>
      </div>
    );
  }

  function renderBox(key: string, head: ReactNode, boxPages: ManagedPage[]) {
    const open = !!expanded[key];
    const has = boxPages.length > 0;
    return (
      <section className={`adm-card adm-pce-box ${open ? "on" : ""}`} key={key}>
        <div className="adm-pce-boxhead">
          <button type="button" className="adm-pce-boxtoggle" aria-expanded={open} onClick={() => toggleBox(key)}>
            {head}
            <span className="adm-pce-boxsum">
              <strong>{money(boxTotal(boxPages))}</strong>
              <span className="adm-pce-boxsub">{boxPages.length} {boxPages.length === 1 ? "page" : "pages"}{has ? ` · ${boxFilled(boxPages)}/${boxPages.length} filled` : ""}</span>
            </span>
            <ChevronDownIcon className={`adm-pce-boxchev ${open ? "on" : ""}`} />
          </button>
          {has && (
            <button type="button" className="adm-btn-ghost adm-pce-saveall" disabled={loading} onClick={(e) => { e.stopPropagation(); boxPages.forEach((p) => void commit(p.id)); }}>
              Save all
            </button>
          )}
        </div>
        {open && (has ? <div className="adm-pce-rows">{boxPages.map(renderRow)}</div> : <p className="adm-card-sub adm-pce-empty">No pages assigned.</p>)}
      </section>
    );
  }

  return (
    <div className="adm-pce">
      <div className="adm-pce-head">
        <div className="adm-pce-datectl">
          <button type="button" className="adm-pce-daynav" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
          <div className="adm-pce-dateshow">
            <span className="adm-pce-datelabel">Earnings for</span>
            <strong className="adm-pce-datebig">{fmtFull(date)}{date === today ? " · today" : ""}</strong>
          </div>
          <label className="adm-pce-datepick" title="Pick a date">
            <CalendarIcon className="h-[18px] w-[18px]" />
            <input
              type="date"
              value={date}
              max={today}
              onClick={(e) => {
                const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
                try {
                  el.showPicker?.();
                } catch {
                  /* not supported — the native input still opens on focus */
                }
              }}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              aria-label="Pick a date"
            />
          </label>
          <button type="button" className="adm-pce-daynav" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="Next day">›</button>
        </div>
        <div className="adm-pce-total">
          Total for {formatDay(date)}: <strong>{money(dayTotal)}</strong> <span className="adm-pce-totalsub">across {dayCount} {dayCount === 1 ? "page" : "pages"}</span>
          {loading && <span className="adm-spinner adm-pce-loading" aria-label="Loading" />}
        </div>
      </div>

      {pages.length === 0 ? (
        <div className="adm-card adm-card-pad" style={{ textAlign: "center", padding: "26px 18px" }}>
          <div className="adm-card-title" style={{ fontSize: 15 }}>No monitored pages yet</div>
          <p className="adm-card-sub" style={{ marginTop: 6 }}>Connect Pages in the Pages tab, then enter their daily earnings here.</p>
        </div>
      ) : (
        <>
          <div className="adm-pce-toolbar">
            <span className="adm-card-sub">
              {sortedManagers.length} {sortedManagers.length === 1 ? "manager" : "managers"}
              {unassigned.length > 0 ? " · unassigned" : ""}
            </span>
            <button type="button" className="adm-btn-ghost adm-pce-expandall" onClick={() => setAll(!anyOpen)}>
              {anyOpen ? "Collapse all" : "Expand all"}
            </button>
          </div>
          <div className="adm-pce-boxes">
            {sortedManagers.map((m) =>
              renderBox(
                m.id,
                <span className="adm-pce-boxmgr">
                  <ManagerAvatar name={m.name} photo={m.photo} size={26} />
                  <span className="adm-pce-boxname">{m.name}</span>
                </span>,
                pages.filter((p) => assignments[p.id] === m.id),
              ),
            )}
            {unassigned.length > 0 &&
              renderBox(
                "_unassigned",
                <span className="adm-pce-boxmgr">
                  <span className="adm-pce-boxavatar-none" aria-hidden>?</span>
                  <span className="adm-pce-boxname">Unassigned</span>
                </span>,
                unassigned,
              )}
          </div>
        </>
      )}
    </div>
  );
}
