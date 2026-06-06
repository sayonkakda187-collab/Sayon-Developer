-- Multi-site foundation: a Site model + Article.siteId, backfilled to a single
-- default site (= the current site). Additive + backward-compatible — no data
-- loss. siteId stays nullable; app code treats null as the default site so no
-- existing article is ever hidden.

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domain" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "logo" TEXT,
    "title" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Site_slug_key" ON "Site"("slug");
CREATE UNIQUE INDEX "Site_domain_key" ON "Site"("domain");
CREATE INDEX "Site_isDefault_idx" ON "Site"("isDefault");

-- Seed the default site (= the current live site).
INSERT INTO "Site" ("id", "name", "slug", "domain", "isDefault", "createdAt", "updatedAt")
VALUES ('site_default', 'The Daily Ledger', 'daily-ledger', 'dailyledger.today', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable: add the (nullable) site link to articles.
ALTER TABLE "Article" ADD COLUMN "siteId" TEXT;

-- Backfill ALL existing articles to the default site (nothing orphaned/hidden).
UPDATE "Article" SET "siteId" = 'site_default';

-- CreateIndex
CREATE INDEX "Article_siteId_status_publishedAt_idx" ON "Article"("siteId", "status", "publishedAt");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
