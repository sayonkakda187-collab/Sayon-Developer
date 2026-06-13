-- Cached all-time post count for the Page Control Summary "Total posts" gauge.
-- Computed lazily when a monitored page's dashboard opens, cached ~24h on the row.
-- `totalPostsCapped` = the count hit the pagination cap (a floor, shown as "N+").
ALTER TABLE "MonitoredPage" ADD COLUMN "totalPosts" INTEGER;
ALTER TABLE "MonitoredPage" ADD COLUMN "totalPostsCapped" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MonitoredPage" ADD COLUMN "totalPostsAt" TIMESTAMP(3);
