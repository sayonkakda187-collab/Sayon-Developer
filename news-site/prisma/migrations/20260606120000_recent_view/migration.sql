-- Short-lived real-time read log for the Audience "Live readers" panel: one row
-- per article view (timestamp + country), pruned to a ~15-minute window on write.
-- Privacy-respecting: an aggregate country code only (no IP/UA/PII).
CREATE TABLE "RecentView" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'ZZ',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecentView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecentView_createdAt_idx" ON "RecentView"("createdAt");

ALTER TABLE "RecentView" ADD CONSTRAINT "RecentView_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
