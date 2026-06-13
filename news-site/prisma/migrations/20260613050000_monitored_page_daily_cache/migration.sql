-- Per-(monitored page, date-range) cache of the day-by-day insights series, its
-- own cache independent from the farm's PageDailyCache. Powers the Page Control
-- dashboard trends AND the landing-list quick stats (56-day window → last 28d vs
-- previous 28d). One row per (monitored page, range).
CREATE TABLE "MonitoredPageDailyCache" (
    "monitoredPageId" TEXT NOT NULL,
    "rangeKey" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoredPageDailyCache_pkey" PRIMARY KEY ("monitoredPageId", "rangeKey")
);

ALTER TABLE "MonitoredPageDailyCache" ADD CONSTRAINT "MonitoredPageDailyCache_monitoredPageId_fkey" FOREIGN KEY ("monitoredPageId") REFERENCES "MonitoredPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
