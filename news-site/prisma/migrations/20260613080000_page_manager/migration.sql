-- Page managers (team members) — LOCAL app data (name + optional uploaded photo),
-- independent of Facebook. Assigned to monitored pages via MonitoredPage.managerId.
CREATE TABLE "PageManager" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "photo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageManager_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MonitoredPage" ADD COLUMN "managerId" TEXT;
CREATE INDEX "MonitoredPage_managerId_idx" ON "MonitoredPage"("managerId");
ALTER TABLE "MonitoredPage" ADD CONSTRAINT "MonitoredPage_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "PageManager"("id") ON DELETE SET NULL ON UPDATE CASCADE;
