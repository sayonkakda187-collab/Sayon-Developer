"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  startRunnerLogin,
  captureRunnerSession,
  validateFacebookSession,
  deleteFacebookSession,
} from "@/app/admin/facebook-actions";
import { useToast } from "@/components/admin/Toast";
import { FacebookIcon, RefreshIcon, TrashIcon } from "@/components/admin/icons";
import { formatDate } from "@/lib/site";

export type FacebookSessionView = {
  id: string;
  label: string;
  accountName: string | null;
  status: string; // "Active" | "Expired"
  lastUsedAt: string | null;
  lastValidatedAt: string | null;
  createdAt: string;
};

function StatusBadge({ status }: { status: string }) {
  const active = status === "Active";
  return (
    <span className={`adm-pill ${active ? "" : "amber"}`} style={{ gap: 5 }}>
      <span
        aria-hidden
        style={{ width: 7, height: 7, borderRadius: 999, background: active ? "#16a34a" : "#dc2626", display: "inline-block" }}
      />
      {active ? "Active" : "Expired"}
    </span>
  );
}

/**
 * "Browser Sessions" panel for /admin/facebook. Capture a logged-in browser
 * session from the self-hosted runner (stored ENCRYPTED) and reuse it to post
 * without logging in again. Only meaningful when the runner is configured.
 */
export function FacebookSessionsManager({
  sessions,
  runnerConfigured,
}: {
  sessions: FacebookSessionView[];
  runnerConfigured: boolean;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<null | "login" | "capture" | string>(null);

  async function onLogin() {
    setBusy("login");
    const res = await startRunnerLogin();
    setBusy(null);
    if (!res.ok) return error(res.error);
    success("Browser opened on the runner — log in by hand, then click “Capture session”.");
  }

  async function onCapture() {
    if (!label.trim()) return error("Give the session a label first.");
    setBusy("capture");
    const res = await captureRunnerSession(label.trim());
    setBusy(null);
    if (!res.ok) return error(res.error);
    success("Session captured and saved (encrypted).");
    setLabel("");
    router.refresh();
  }

  async function onValidate(id: string) {
    setBusy(id);
    const res = await validateFacebookSession(id);
    setBusy(null);
    if (!res.ok) return error(res.error);
    if (res.data.loggedIn) success("Session is still logged in.");
    else error("Session is no longer logged in — re-capture it.");
    router.refresh();
  }

  async function onDelete(id: string) {
    setBusy(id);
    const res = await deleteFacebookSession(id);
    setBusy(null);
    if (!res.ok) return error(res.error);
    success("Session deleted.");
    router.refresh();
  }

  return (
    <div className="adm-card adm-card-pad" style={{ marginBottom: 20 }}>
      <div className="adm-fbpanel-hd">
        <FacebookIcon className="h-[18px] w-[18px]" />
        <span>Browser Sessions</span>
      </div>

      {!runnerConfigured ? (
        <p className="adm-field-hint" style={{ marginTop: 6 }}>
          The self-hosted browser runner isn’t configured. Set <code>FB_RUNNER_URL</code> +{" "}
          <code>FB_RUNNER_TOKEN</code> (see <code>/fb-runner</code>) to capture and reuse logged-in
          sessions for posting.
        </p>
      ) : (
        <>
          <p className="adm-fbpanel-note">
            Log in once on the runner, capture the session here (stored <strong>encrypted</strong>),
            then pick it when posting to publish without logging in again.
          </p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "12px 0" }}>
            <button type="button" className="adm-btn-ghost" onClick={onLogin} disabled={busy !== null}>
              {busy === "login" && <span className="adm-spinner" aria-hidden />}
              1 · Start login
            </button>
            <input
              className="adm-input"
              placeholder="Session label, e.g. Main account"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={{ minWidth: 220 }}
              aria-label="Session label"
            />
            <button type="button" className="adm-btn-primary" onClick={onCapture} disabled={busy !== null}>
              {busy === "capture" && <span className="adm-spinner" aria-hidden />}
              2 · Capture session
            </button>
          </div>

          <p className="adm-field-hint" style={{ marginTop: 0 }}>
            ⚠️ A saved session is a live credential — anyone with it is logged into that account.
            It’s encrypted at rest; only capture accounts you own. Automating Facebook is against its
            Terms and risks the account.
          </p>

          {sessions.length === 0 ? (
            <p className="adm-field-hint">No saved sessions yet.</p>
          ) : (
            <table className="adm-table" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Account</th>
                  <th>Status</th>
                  <th>Last used</th>
                  <th>Last checked</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.label}</td>
                    <td>{s.accountName ?? <span className="adm-amt">—</span>}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td className="adm-amt">{s.lastUsedAt ? formatDate(s.lastUsedAt) : "—"}</td>
                    <td className="adm-amt">{s.lastValidatedAt ? formatDate(s.lastValidatedAt) : "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="adm-btn-ghost"
                          style={{ padding: "5px 9px" }}
                          onClick={() => onValidate(s.id)}
                          disabled={busy !== null}
                          title="Re-check if this session is still logged in"
                        >
                          {busy === s.id ? <span className="adm-spinner" aria-hidden /> : <RefreshIcon className="h-4 w-4" />}
                          Check
                        </button>
                        <button
                          type="button"
                          className="adm-btn-ghost"
                          style={{ padding: "5px 9px" }}
                          onClick={() => onDelete(s.id)}
                          disabled={busy !== null}
                          title="Delete this saved session"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
