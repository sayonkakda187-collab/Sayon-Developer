-- Page Control (INDEPENDENT watch-only monitoring) — a separate, hand-picked set
-- of Facebook Pages with its OWN tokens, fully independent from the posting farm's
-- FacebookPage table. Read-only; the Page token only needs read scopes.
CREATE TABLE "MonitoredPage" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "avatarFetchedAt" TIMESTAMP(3),
    "followers" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'Connected',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoredPage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonitoredPage_pageId_key" ON "MonitoredPage"("pageId");
CREATE INDEX "MonitoredPage_status_idx" ON "MonitoredPage"("status");

-- ~6h cache of a monitored page's real published posts (independent from the
-- farm's PagePostsCache). One row per monitored page.
CREATE TABLE "MonitoredPagePostsCache" (
    "monitoredPageId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoredPagePostsCache_pkey" PRIMARY KEY ("monitoredPageId")
);

ALTER TABLE "MonitoredPagePostsCache" ADD CONSTRAINT "MonitoredPagePostsCache_monitoredPageId_fkey" FOREIGN KEY ("monitoredPageId") REFERENCES "MonitoredPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
