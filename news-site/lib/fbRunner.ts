import "server-only";

import { siteConfig } from "@/lib/site";

// Server-only client for the self-hosted fb-runner (persistent-browser posting).
// The runner is OPTIONAL: when FB_RUNNER_URL is unset, posting uses the Graph API
// as before. FB_RUNNER_TOKEN is the shared secret. The runner URL/token never
// reach the browser — only server actions call this.
//
// See /fb-runner for the service. It cannot run on Vercel (needs a long-lived
// process); host it yourself and point FB_RUNNER_URL at it.

const RUNNER_URL = process.env.FB_RUNNER_URL?.replace(/\/+$/, "");
const RUNNER_TOKEN = process.env.FB_RUNNER_TOKEN || "";
const TIMEOUT_MS = 90_000; // browser automation is slow; give it room

export function isRunnerConfigured(): boolean {
  return Boolean(RUNNER_URL && RUNNER_TOKEN);
}

export type RunnerPage = { id: string; name: string; url: string };

// A Playwright storageState (cookies + localStorage). Treated as opaque here —
// captured from the runner, encrypted by the caller, and passed back to post.
export type SessionState = { cookies: unknown[]; origins: unknown[] };

export class RunnerError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RunnerError";
    this.code = code;
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (!isRunnerConfigured()) throw new RunnerError("unconfigured", "Browser runner is not configured.");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${RUNNER_URL}${path}`, {
      method,
      headers: { "content-type": "application/json", "x-runner-token": RUNNER_TOKEN },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (e) {
    throw new RunnerError("network", (e as Error).name === "AbortError" ? "Runner timed out." : "Couldn’t reach the browser runner. Is it running?");
  } finally {
    clearTimeout(t);
  }
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string } & T;
  if (!res.ok || data.ok === false) {
    throw new RunnerError(data.code || "unknown", data.error || `Runner error (HTTP ${res.status}).`);
  }
  return data as T;
}

/** Is the runner reachable + logged in? Safe to call from the UI status check. */
export async function runnerStatus(): Promise<{ reachable: boolean; loggedIn: boolean }> {
  if (!isRunnerConfigured()) return { reachable: false, loggedIn: false };
  try {
    const r = await call<{ loggedIn: boolean }>("GET", "/status");
    return { reachable: true, loggedIn: Boolean(r.loggedIn) };
  } catch {
    return { reachable: false, loggedIn: false };
  }
}

/** Open a visible browser on the runner for a manual login. */
export async function runnerLogin(): Promise<{ loggedIn: boolean }> {
  const r = await call<{ loggedIn?: boolean }>("POST", "/login");
  return { loggedIn: Boolean(r.loggedIn) };
}

/** Capture the live login session (storageState) + best-effort account name. */
export async function runnerExportSession(): Promise<{ state: SessionState; accountName: string | null }> {
  const r = await call<{ state: SessionState; accountName: string | null }>("GET", "/session/export");
  return { state: r.state, accountName: r.accountName ?? null };
}

/** Re-check a saved session: is it still logged in? */
export async function runnerValidateSession(
  state: SessionState,
): Promise<{ loggedIn: boolean; accountName: string | null }> {
  const r = await call<{ loggedIn?: boolean; accountName?: string | null }>("POST", "/session/validate", { state });
  return { loggedIn: Boolean(r.loggedIn), accountName: r.accountName ?? null };
}

/** Post a message (optionally with an image) to a target Page via the runner. When
 *  `state` is given, the runner posts using that saved session (no manual login). */
export async function runnerPost(input: {
  pageUrl: string;
  pageName: string;
  message: string;
  imageBase64?: string;
  state?: SessionState;
}): Promise<{ ok: true }> {
  await call("POST", "/post", input);
  return { ok: true };
}

/** List the Pages the logged-in account manages (best-effort scrape). Uses the
 *  runner's on-disk session by default, or a given saved session `state`. */
export async function runnerPages(state?: SessionState): Promise<RunnerPage[]> {
  if (state) {
    const r = await call<{ pages: RunnerPage[] }>("POST", "/pages", { state });
    return r.pages ?? [];
  }
  const r = await call<{ pages: RunnerPage[] }>("GET", "/pages");
  return r.pages ?? [];
}

/** Absolute URL for an article (the runner posts the link as part of the text). */
export function articleLink(slug: string): string {
  return `${siteConfig.url}/news/${slug}`;
}
