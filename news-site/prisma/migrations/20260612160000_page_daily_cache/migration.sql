-- Per-(Page, date-range) cache of the day-by-day insights series for the Insights
-- day view, so changing the range doesn't re-hit the Graph API for every Page.
-- `rangeKey` is "from_to" (Phnom-Penh dates); `data` is a small JSON DayPoint[].
CREATE TABLE "PageDailyCache" (
    "facebookPageId" TEXT NOT NULL,
    "rangeKey" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageDailyCache_pkey" PRIMARY KEY ("facebookPageId", "rangeKey")
);

ALTER TABLE "PageDailyCache" ADD CONSTRAINT "PageDailyCache_facebookPageId_fkey" FOREIGN KEY ("facebookPageId") REFERENCES "FacebookPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
