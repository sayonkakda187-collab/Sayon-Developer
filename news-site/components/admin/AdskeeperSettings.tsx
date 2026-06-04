"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/admin/Toast";
import { saveAdskeeperKey, saveAdskeeperClient } from "@/app/admin/settings-actions";
import { CoinsIcon, CheckIcon } from "@/components/admin/icons";

type Status = {
  keySource: "db" | "env" | "none";
  clientIdSource: "db" | "env" | "none";
  configured: boolean;
  apiKeyEnv: string;
  clientIdEnv: string;
};

/**
 * AdsKeeper settings: paste the publisher API key (encrypted at rest, never
 * returned here) and an optional Client/Publisher ID. Mirrors the news-API key
 * cards — this UI only ever shows configured/not-configured status.
 */
export function AdskeeperSettings({ status }: { status: Status }) {
  const { success, error } = useToast();
  const [key, setKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [keySource, setKeySource] = useState(status.keySource);
  const [clientSource, setClientSource] = useState(status.clientIdSource);
  const [pending, startTransition] = useTransition();

  function saveKey(clear = false) {
    startTransition(async () => {
      const res = await saveAdskeeperKey(clear ? "" : key);
      if (res.ok) {
        setKey("");
        setKeySource(clear ? (status.keySource === "env" ? "env" : "none") : "db");
        success(clear ? "AdsKeeper key cleared." : "AdsKeeper key saved (encrypted).");
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

  const keyLabel =
    keySource === "db" ? "Saved in database (encrypted)"
      : keySource === "env" ? `From ${status.apiKeyEnv} (env)`
        : "Not set";
  const clientLabel =
    clientSource === "db" ? "Saved"
      : clientSource === "env" ? `From ${status.clientIdEnv} (env)`
        : "Not set";

  return (
    <div className="adm-card adm-card-pad">
      <div className="adm-settings-head">
        <div>
          <div className="adm-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CoinsIcon className="h-[18px] w-[18px]" /> AdsKeeper earnings
          </div>
          <a className="adm-link" href="https://adskeeper.com" target="_blank" rel="noopener noreferrer">adskeeper.com</a>
        </div>
        <span className={`adm-keypill ${keySource !== "none" ? "on" : ""}`}>
          {keySource !== "none" && <CheckIcon className="h-3 w-3" />}
          {keyLabel}
        </span>
      </div>

      <p className="adm-settings-note">
        Pulls real impressions, clicks, CTR and revenue into the dashboard Earnings panel via the
        AdsKeeper publisher REST API. In AdsKeeper: <strong>Account settings → API → copy your API
        Key</strong>. The key is encrypted at rest and never sent to the browser.
      </p>

      <label className="adm-field" style={{ marginTop: 10 }}>
        <span>API key / token</span>
        <input
          className="adm-input"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={keySource === "db" ? "•••••••• (saved) — paste to replace" : "Paste your AdsKeeper API key"}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <div className="adm-settings-actions">
        <button type="button" className="adm-btn-primary" onClick={() => saveKey(false)} disabled={pending || key.trim().length < 6}>
          {pending ? <span className="adm-spinner" aria-hidden /> : null}
          Save key
        </button>
        {keySource === "db" && (
          <button type="button" className="adm-btn-ghost" onClick={() => saveKey(true)} disabled={pending}>Clear</button>
        )}
      </div>

      <label className="adm-field" style={{ marginTop: 14 }}>
        <span>
          Client / Publisher ID{" "}
          <span className="adm-field-hint" style={{ display: "inline" }}>(optional — only if your account needs it)</span>
        </span>
        <input
          className="adm-input"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder={clientSource === "db" ? "saved — type to replace" : "e.g. your AdsKeeper account / client id"}
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
        <span className={`adm-keypill ${clientSource !== "none" ? "on" : ""}`} style={{ marginLeft: "auto" }}>{clientLabel}</span>
      </div>

      <p className="adm-field-hint" style={{ marginTop: 10 }}>
        Or set <code className="adm-fb-code">{status.apiKeyEnv}</code> (and optionally{" "}
        <code className="adm-fb-code">{status.clientIdEnv}</code>) in Vercel. A saved DB key takes priority over env.
      </p>
    </div>
  );
}
