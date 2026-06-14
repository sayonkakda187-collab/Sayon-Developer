import "server-only";
import { createHash, randomBytes } from "crypto";

import { prisma } from "@/lib/db";

// Manager Portal magic-link tokens. The raw token lives only in the URL the admin
// shares; we store and look up by its SHA-256 hash (so a DB leak never exposes working
// links). Generating a new token revokes the old one; `portalEnabled` gates access.

/** A long, unguessable, URL-safe portal token. */
export function generatePortalToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 (hex) of a portal token — what we persist + query by. */
export function hashPortalToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Resolve a raw portal token to its (enabled) manager, or null. Used by the portal. */
export async function managerForPortalToken(raw: string): Promise<{ id: string; name: string; photo: string | null } | null> {
  if (!raw || raw.length < 16) return null;
  const m = await prisma.pageManager
    .findUnique({ where: { portalTokenHash: hashPortalToken(raw) }, select: { id: true, name: true, photo: true, portalEnabled: true } })
    .catch(() => null);
  if (!m || !m.portalEnabled) return null;
  return { id: m.id, name: m.name, photo: m.photo };
}
