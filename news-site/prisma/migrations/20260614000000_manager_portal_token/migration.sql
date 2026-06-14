-- Manager Portal: a per-manager magic-link token for a shareable, read-only portal
-- (/portal/<token>). The token is stored HASHED (SHA-256) — only the hash is kept;
-- the raw token is shown once when generated. `portalEnabled` disables a link without
-- changing the token (re-enable restores it; regenerate replaces it).
ALTER TABLE "PageManager" ADD COLUMN "portalTokenHash" TEXT;
ALTER TABLE "PageManager" ADD COLUMN "portalEnabled" BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX "PageManager_portalTokenHash_key" ON "PageManager"("portalTokenHash");
