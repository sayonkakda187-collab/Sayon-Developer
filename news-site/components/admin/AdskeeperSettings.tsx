"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/admin/Toast";
import { saveAdskeeperLogin, saveAdskeeperKey, saveAdskeeperClient } from "@/app/admin/settings-actions";
import { testAdskeeperConnection } from "@/app/admin/adskeeper-actions";
import type { AuthProbe } from "@/lib/adskeeper/types";
import { CoinsIcon, CheckIcon } from "@/components/admin/icons";

type Source = "db" | "env" | "none";
type Status = {
  authMode: "login" | "token" | "none";
  tokenSource: Source;
  loginSource: Source;
  passwordSource: Source;
  clientIdSource: Source;
  configured: boolean;
  env: { apiKey: string; login: string; password: string; clientId: string };
};

/**
 * AdsKeeper settings. Primary path: account LOGIN + PASSWORD, which the server
 * exchanges for a short-lived token via the AdsKeeper auth function. Fallback:
 * paste a ready API TOKEN + Client/Publisher ID. Secrets are encrypted at rest
 * and never returned here — this UI only shows configured/not-configured status.
 */
export function AdskeeperSettings({ status }: { status: Status }) {
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();

  // Login + password (primary)
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loginSource, setLoginSource] = useState(status.loginSource);
  const [passwordSource, setPasswordSource] = useState(status.passwordSource);

  // Token + client id (fallback)
  const [token, setToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [tokenSource, setTokenSource] = useState(status.tokenSource);
  const [clientSource, setClientSource] = useState(status.clientIdSource);

  // Connection test (runs against AdsKeeper from the server; reports the auth path)
  const [testing, setTesting] = useState(false);
  const [probe, setProbe] = useState<AuthProbe | null>(null);

  async function runTest() {
    setTesting(true);
    setProbe(null);
    try {
      const res = await testAdskeeperConnection();
      setProbe(res);
      if (res.ok) success(`AdsKeeper connected${res.authPath ? ` · auth: ${res.authPath}` : ""}.`);
      else error(res.error);
    } finally {
      setTesting(false);
    }
  }

  const loginConfigured = loginSource !== "none" && passwordSource !== "none";
  const authMode: Status["authMode"] = loginConfigured ? "login" : tokenSource !== "none" ? "token" : "none";
  const headPill =
    authMode === "login" ? "Connected via login"
      : authMode === "token" ? "Connected via API token"
        : "Not set";

  function saveLogin(clear = false) {
    startTransition(async () => {
      const res = await saveAdskeeperLogin(clear ? "" : login, clear ? "" : password);
      if (res.ok) {
        setPassword("");
        if (clear) {
          setLogin("");
          setLoginSource(status.loginSource === "env" ? "env" : "none");
          setPasswordSource(status.passwordSource === "env" ? "env" : "none");
          success("AdsKeeper login cleared.");
        } else {
          if (login.trim()) setLoginSource("db");
          if (password.trim()) setPasswordSource("db");
          success("AdsKeeper login saved (password encrypted).");
        }
      } else error(res.error);
    });
  }

  function saveToken(clear = false) {
    startTransition(async () => {
      const res = await saveAdskeeperKey(clear ? "" : token);
      if (res.ok) {
        setToken("");
        setTokenSource(clear ? (status.tokenSource === "env" ? "env" : "none") : "db");
        success(clear ? "API token cleared." : "AdsKeeper API token saved (encrypted).");
      } else error(res.error);
    });
  }

  function saveClient(clear = false) {
    startTransition(async () => {
      const res = await saveAdskeeperClient(clear ? "" : clientId);
      if (res.ok) {
        setClientId("");
        setClientSource(clear ? (status.clientIdSource === "env" ? "env" : "none") : "db");
        success(clear ? "Client ID cleared." : "Client ID saved.");
      } else error(res.error);
    });
  }

  return (
    <div className="adm-card adm-card-pad">
      <div className="adm-settings-head">
        <div>
          <div className="adm-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CoinsIcon className="h-[18px] w-[18px]" /> AdsKeeper earnings
          </div>
          <a className="adm-link" href="https://adskeeper.com" target="_blank" rel="noopener noreferrer">adskeeper.com</a>
        </div>
        <span className={`adm-keypill ${authMode !== "none" ? "on" : ""}`}>
          {authMode !== "none" && <CheckIcon className="h-3 w-3" />}
          {headPill}
        </span>
      </div>

      <p className="adm-settings-note">
        Pulls real impressions, clicks, CTR and revenue into the dashboard Earnings panel via the
        AdsKeeper publisher REST API. AdsKeeper exchanges your <strong>account login + password</strong>{" "}
        for a short-lived token server-side. Your password is encrypted at rest and never sent to the
        browser.
      </p>

      {/* Primary: login + password */}
      <div style={{ marginTop: 6 }}>
        <div className="adm-card-title" style={{ fontSize: 13.5 }}>Account login</div>
        <label className="adm-field" style={{ marginTop: 8 }}>
          <span>Login / email</span>
          <input
            className="adm-input"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder={loginSource !== "none" ? "saved — type to replace" : "your AdsKeeper login / email"}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="adm-field" style={{ marginTop: 10 }}>
          <span>Password</span>
          <input
            className="adm-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={passwordSource !== "none" ? "•••••••• (saved) — type to replace" : "your AdsKeeper password"}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="adm-settings-actions">
          <button
            type="button"
            className="adm-btn-primary"
            onClick={() => saveLogin(false)}
            disabled={pending || (!login.trim() && !password.trim())}
          >
            {pending ? <span className="adm-spinner" aria-hidden /> : null}
            Save login
          </button>
          {loginConfigured && (
            <button type="button" className="adm-btn-ghost" onClick={() => saveLogin(true)} disabled={pending}>Disconnect</button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 8px" }}>
        <span style={{ height: 1, flex: 1, background: "var(--adm-bd)" }} />
        <span className="adm-card-sub" style={{ marginTop: 0 }}>or use a ready API token</span>
        <span style={{ height: 1, flex: 1, background: "var(--adm-bd)" }} />
      </div>

      {/* Fallback: token + client id */}
      <div>
        <label className="adm-field">
          <span>API token <span className="adm-field-hint" style={{ display: "inline" }}>(if your dashboard shows one)</span></span>
          <input
            className="adm-input"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={tokenSource === "db" ? "•••••••• (saved) — paste to replace" : "paste a ready 32-char token"}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="adm-settings-actions">
          <button type="button" className="adm-btn-primary" onClick={() => saveToken(false)} disabled={pending || token.trim().length < 6}>
            Save token
          </button>
          {tokenSource === "db" && (
            <button type="button" className="adm-btn-ghost" onClick={() => saveToken(true)} disabled={pending}>Clear</button>
          )}
        </div>

        <label className="adm-field" style={{ marginTop: 12 }}>
          <span>Client / Publisher ID (idAuth) <span className="adm-field-hint" style={{ display: "inline" }}>(needed with a token)</span></span>
          <input
            className="adm-input"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={clientSource === "db" ? "saved — type to replace" : "your AdsKeeper account / client id"}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="adm-settings-actions">
          <button type="button" className="adm-btn-primary" onClick={() => saveClient(false)} disabled={pending || clientId.trim().length < 1}>
            Save ID
          </button>
          {clientSource === "db" && (
            <button type="button" className="adm-btn-ghost" onClick={() => saveClient(true)} disabled={pending}>Clear</button>
          )}
        </div>
      </div>

      {/* Test connection — reports which auth path worked (no secrets shown) */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--adm-bd)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="adm-btn-primary" onClick={runTest} disabled={testing || authMode === "none"}>
            {testing ? <span className="adm-spinner" aria-hidden /> : null}
            Test connection
          </button>
          <span className="adm-card-sub" style={{ marginTop: 0 }}>
            Verifies your credentials against AdsKeeper and reports which auth path worked.
          </span>
        </div>
        {probe && (
          <div className="adm-trend-note" role="status" style={{ marginTop: 12 }}>
            <p style={{ margin: 0 }}>
              {probe.ok ? (
                <>
                  <strong style={{ color: "#16a34a" }}>Connected.</strong>{" "}
                  {probe.mode === "login" && probe.authPath ? (
                    <>Auth path: <code className="adm-fb-code">{probe.authPath}</code>. </>
                  ) : null}
                  {probe.authId ? (
                    <>Account (idAuth): <code className="adm-fb-code">{probe.authId}</code>.</>
                  ) : null}
                </>
              ) : (
                <>
                  <strong>Not connected.</strong> {probe.error}
                  {probe.tried?.length ? (
                    <>
                      <br />
                      Tried:{" "}
                      {probe.tried.map((t) => (
                        <code key={t} className="adm-fb-code" style={{ marginRight: 4 }}>{t}</code>
                      ))}
                    </>
                  ) : null}
                </>
              )}
            </p>
          </div>
        )}
      </div>

      <p className="adm-field-hint" style={{ marginTop: 12 }}>
        Env fallback: <code className="adm-fb-code">{status.env.login}</code> /{" "}
        <code className="adm-fb-code">{status.env.password}</code> (or{" "}
        <code className="adm-fb-code">{status.env.apiKey}</code> +{" "}
        <code className="adm-fb-code">{status.env.clientId}</code>) in Vercel. A saved DB value beats env.
      </p>
    </div>
  );
}
