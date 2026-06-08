"use client";

import { useState, type FormEvent } from "react";

/** Full-bleed accent newsletter band ("The Ledger Brief"). Posts to the existing
 *  /api/newsletter endpoint and swaps to an italic confirmation on success. */
export function LedgerNewsletter() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setDone(true);
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="tl-news" id="ledger-brief">
      <div className="tl-news-inner">
        <div className="tl-news-copy">
          <span className="tl-news-eyebrow">The Ledger Brief</span>
          <h2 className="tl-news-title">The day&apos;s biggest stories, delivered to your inbox.</h2>
          <p className="tl-news-sub">One considered email each morning. No noise. Unsubscribe anytime.</p>
        </div>
        <div>
          {done ? (
            <div className="tl-news-done">You&apos;re subscribed. Welcome to the Ledger.</div>
          ) : (
            <form className="tl-news-form" onSubmit={onSubmit}>
              <input
                className="tl-news-input"
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-label="Email address"
              />
              <button className="tl-news-btn" type="submit" disabled={loading}>
                {loading ? "…" : "Subscribe"}
              </button>
            </form>
          )}
          {error && (
            <p role="status" style={{ marginTop: 8, fontSize: 12.5, color: "rgba(255,255,255,.85)" }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
