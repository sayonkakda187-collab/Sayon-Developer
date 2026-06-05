-- Per-country visitor counts for the admin Audience analytics. Privacy-respecting:
-- counts only (no IP/UA/PII), keyed by article + ISO alpha-2 country + UTC day.
-- Country comes from the free Vercel x-vercel-ip-country header ("ZZ" = unknown).
CREATE TABLE "ArticleCountryView" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "articleId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ArticleCountryView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArticleCountryView_articleId_countryCode_date_key" ON "ArticleCountryView"("articleId", "countryCode", "date");
CREATE INDEX "ArticleCountryView_countryCode_idx" ON "ArticleCountryView"("countryCode");
CREATE INDEX "ArticleCountryView_date_idx" ON "ArticleCountryView"("date");

ALTER TABLE "ArticleCountryView" ADD CONSTRAINT "ArticleCountryView_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
