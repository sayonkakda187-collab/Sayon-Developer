-- Per-(monitored page, date-range) cache of the page's published-post counts WITHIN
-- the range (total + video/image split + capped flag), for the landing-list
-- range-aware "Posts" pill. One row per (page, range).
CREATE TABLE "MonitoredPageRangePostsCache" (
    "monitoredPageId" TEXT NOT NULL,
    "rangeKey" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoredPageRangePostsCache_pkey" PRIMARY KEY ("monitoredPageId", "rangeKey")
);

ALTER TABLE "MonitoredPageRangePostsCache" ADD CONSTRAINT "MonitoredPageRangePostsCache_monitoredPageId_fkey" FOREIGN KEY ("monitoredPageId") REFERENCES "MonitoredPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
