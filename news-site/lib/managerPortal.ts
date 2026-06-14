import "server-only";
import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";

import { prisma } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

// Manager Portal magic-link tokens. The raw token lives in the shared URL; we look it up
// by its SHA-256 hash, and ALSO keep it encrypted-at-rest so the admin can re-view/copy
// the link anytime. Generating a new token revokes the old; `portalEnabled` gates access.

export const PORTAL_COOKIE = "portal_token";

/** A long, unguessable, URL-safe portal token. */
export function generatePortalToken(): string {
  return randomBytes(32).toString("base64url");
}
/** SHA-256 (hex) — the fast unique lookup key. */
export function hashPortalToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
export function encryptPortalToken(raw: string): string {
  return encryptSecret(raw);
}
/** Decrypt a stored token for the admin UI (null if missing/undecryptable). */
export function decryptPortalToken(stored: string | null): string | null {
  if (!stored) return null;
  try {
    return decryptSecret(stored);
  } catch {
    return null;
  }
}

export type PortalManager = { id: string; name: string; photo: string | null };

/** Resolve a raw portal token → its ENABLED manager, or null (disabled/unknown). */
export async function managerForPortalToken(raw: string): Promise<PortalManager | null> {
  if (!raw || raw.length < 16) return null;
  const m = await prisma.pageManager
    .findUnique({ where: { portalTokenHash: hashPortalToken(raw) }, select: { id: true, name: true, photo: true, portalEnabled: true } })
    .catch(() => null);
  if (!m || !m.portalEnabled) return null;
  return { id: m.id, name: m.name, photo: m.photo };
}

/** The current request's portal session (from the `portal_token` cookie) → manager, or
 *  null. Re-validated every call: a disabled or regenerated token stops resolving at once. */
export async function getPortalManager(): Promise<PortalManager | null> {
  const token = cookies().get(PORTAL_COOKIE)?.value;
  if (!token) return null;
  return managerForPortalToken(token);
}
