import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * Symmetric encryption for sensitive credentials at rest (Facebook Page access
 * tokens). AES-256-GCM (authenticated encryption) so tampering is detected on
 * decrypt. The key is derived from a server-side secret and NEVER leaves the
 * server — encrypted values are the only thing stored in the database.
 *
 * Stored format (single string column): `v1:<ivB64>:<tagB64>:<cipherB64>`.
 * The `v1` prefix lets us rotate the scheme later without ambiguity.
 *
 * Key source (in priority order):
 *   1) ENCRYPTION_KEY  — a dedicated secret (recommended; `openssl rand -hex 32`)
 *   2) AUTH_SECRET     — reuse the existing session secret if no dedicated key
 * In production at least one MUST be set, or encryption throws (we never want to
 * silently encrypt tokens with a guessable dev key on the live site).
 */

const SCHEME = "v1";
// Static salt: this only stretches an already-high-entropy secret into a 32-byte
// key; it is not a password hash, so a constant app-scoped salt is appropriate.
const KEY_SALT = "fb-token-enc-v1";
const DEV_FALLBACK_SECRET = "dev-insecure-secret-change-me";

function rawSecret(): string {
  const value = process.env.ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (value && value.length > 0) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ENCRYPTION_KEY (or AUTH_SECRET) is required in production to encrypt " +
        "Facebook access tokens. Set ENCRYPTION_KEY to a long random value " +
        "(e.g. `openssl rand -hex 32`).",
    );
  }
  return DEV_FALLBACK_SECRET;
}

let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (cachedKey) return cachedKey;
  // scrypt → deterministic 32-byte (256-bit) key from the secret.
  cachedKey = scryptSync(rawSecret(), KEY_SALT, 32);
  return cachedKey;
}

/** Encrypt a plaintext secret. Returns the versioned, self-describing string. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit nonce, recommended for GCM
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    SCHEME,
    iv.toString("base64"),
    tag.toString("base64"),
    ct.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a value produced by {@link encryptSecret}. Throws on a malformed
 * payload, an unknown scheme, or a failed authentication tag (tampering or a
 * changed key). Callers should catch and treat failure as an unusable token.
 */
export function decryptSecret(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== SCHEME) {
    throw new Error("Unrecognized encrypted token format.");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** True if a stored string looks like our encrypted format (cheap sniff). */
export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && value.startsWith(`${SCHEME}:`);
}
