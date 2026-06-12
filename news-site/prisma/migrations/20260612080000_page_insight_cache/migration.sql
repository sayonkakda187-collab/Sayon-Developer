-- ~12h cache of each Page's computed Insights overview (followers / 28-day reach /
-- 28-day engagement + status), so the Insights tab doesn't re-hit the Graph API for
-- ~264 Pages on every load. One row per connected Page.
CREATE TABLE "PageInsightCache" (
    "facebookPageId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageInsightCache_pkey" PRIMARY KEY ("facebookPageId")
);

ALTER TABLE "PageInsightCache" ADD CONSTRAINT "PageInsightCache_facebookPageId_fkey" FOREIGN KEY ("facebookPageId") REFERENCES "FacebookPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
