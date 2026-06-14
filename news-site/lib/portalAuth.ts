import "server-only";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { managerForPortalToken, type PortalManager } from "@/lib/managerPortal";

// Manager Portal request hardening: rate-limit the (unauthenticated) magic-link
// endpoints and centralize token→manager resolution so every portal route enforces
// the same checks.

/** Send on every portal response so a shared/CDN cache never stores per-token data. */
export const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

// Best-effort, in-memory sliding-window limiter. NOTE: on Vercel each serverless
// instance keeps its OWN counters, so this throttles a single hot instance — a
// practical brake against accidental hammering or a single abuser, not a
// distributed guarantee (that would need Redis/Upstash — a new dep + env, which we
// deliberately don't add). Portal tokens are 32 random bytes, so brute-forcing one
// is already cryptographically infeasible; this is defence-in-depth + DoS courtesy.
type Window = { count: number; reset: number };
const WINDOWS = new Map<string, Window>();
const MINUTE = 60_000;

function hit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const w = WINDOWS.get(key);
  if (!w || now >= w.reset) {
    WINDOWS.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (w.count >= max) return false;
  w.count += 1;
  return true;
}

// Evict expired windows once the map grows, so it can't leak memory unbounded.
function sweep(): void {
  if (WINDOWS.size < 2000) return;
  const now = Date.now();
  for (const [k, w] of WINDOWS) if (now >= w.reset) WINDOWS.delete(k);
}

function clientIp(h: { get(name: string): string | null }): string {
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim() || "unknown";
  return h.get("x-real-ip") || "unknown";
}

/**
 * Portal API guard: throttle by client IP (plus a looser per-token ceiling so one
 * leaked link can't be hammered), then resolve the token → its enabled manager.
 * Returns the manager, or a ready `NextResponse` to return as-is — **429** when
 * throttled, **401** when the token is unknown/disabled. Error responses are no-store.
 */
export async function requirePortalManager(req: Request, token: string): Promise<PortalManager | NextResponse> {
  sweep();
  const ip = clientIp(req.headers);
  if (!hit(`api:ip:${ip}`, 120, MINUTE) || !hit(`api:tok:${token.slice(0, 32)}`, 240, MINUTE)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please slow down." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": "60" } },
    );
  }
  const mgr = await managerForPortalToken(token);
  if (!mgr) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  return mgr;
}

/** Portal PAGE guard (server component): throttle full-page renders by client IP. */
export function portalPageRateLimited(): boolean {
  sweep();
  return !hit(`page:ip:${clientIp(headers())}`, 40, MINUTE);
}
