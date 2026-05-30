"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BookIcon } from "@/components/admin/icons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.push("/admin");
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Login failed.");
        setLoading(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div
      className="admin-shell adm-stage"
      style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20, minHeight: "100dvh" }}
    >
      <div className="adm-auth-card adm-rise">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="adm-mark">
            <BookIcon className="h-[18px] w-[18px]" />
          </span>
          <div>
            <div className="adm-wordmark adm-serif" style={{ fontSize: 19 }}>The Daily Ledger</div>
            <div className="adm-eyebrow">Publisher dashboard</div>
          </div>
        </div>

        <h1 className="adm-serif" style={{ marginTop: 22, fontSize: 20, fontWeight: 700, color: "var(--adm-ink)" }}>
          Admin sign in
        </h1>

        <form onSubmit={onSubmit} style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label htmlFor="email" style={{ fontSize: 13, fontWeight: 600, color: "var(--adm-muted)" }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="adm-input"
              style={{ marginTop: 5 }}
            />
          </div>
          <div>
            <label htmlFor="password" style={{ fontSize: 13, fontWeight: 600, color: "var(--adm-muted)" }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="adm-input"
              style={{ marginTop: 5 }}
            />
          </div>

          {error && <p style={{ fontSize: 13, color: "#dc2626" }}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="adm-btn-primary"
            style={{ width: "100%", opacity: loading ? 0.6 : 1, marginTop: 2 }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
