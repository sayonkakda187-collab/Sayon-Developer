-- Earnings Telegram bot + daily per-page earnings.
--
-- PageManager gains a human `linkCode` (admin hands it to the manager, who DMs the bot
-- `/start <linkCode>`) and a unique `telegramChatId` (null until linked). PageEarning
-- stores one earnings value per (monitored page, Phnom-Penh day) — LOCAL app data the
-- manager enters via the bot (Facebook has no earnings API); re-entry overwrites.

ALTER TABLE "PageManager" ADD COLUMN "linkCode" TEXT;
ALTER TABLE "PageManager" ADD COLUMN "telegramChatId" TEXT;

-- Backfill a link code for any existing managers (name letters + 6 chars of the id keep
-- it unique). New/regenerated codes are produced in app code (e.g. "DARA-4827").
UPDATE "PageManager"
SET "linkCode" =
  upper(coalesce(nullif(regexp_replace("name", '[^A-Za-z]', '', 'g'), ''), 'MGR'))
  || '-' || upper(substr("id", length("id") - 5, 6))
WHERE "linkCode" IS NULL;

ALTER TABLE "PageManager" ALTER COLUMN "linkCode" SET NOT NULL;

CREATE UNIQUE INDEX "PageManager_linkCode_key" ON "PageManager"("linkCode");
CREATE UNIQUE INDEX "PageManager_telegramChatId_key" ON "PageManager"("telegramChatId");

-- Daily per-page earnings (one row per page per PP day).
CREATE TABLE "PageEarning" (
    "id" TEXT NOT NULL,
    "monitoredPageId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "enteredByManagerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageEarning_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PageEarning_monitoredPageId_date_key" ON "PageEarning"("monitoredPageId", "date");
CREATE INDEX "PageEarning_date_idx" ON "PageEarning"("date");
CREATE INDEX "PageEarning_enteredByManagerId_idx" ON "PageEarning"("enteredByManagerId");

ALTER TABLE "PageEarning" ADD CONSTRAINT "PageEarning_monitoredPageId_fkey" FOREIGN KEY ("monitoredPageId") REFERENCES "MonitoredPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PageEarning" ADD CONSTRAINT "PageEarning_enteredByManagerId_fkey" FOREIGN KEY ("enteredByManagerId") REFERENCES "PageManager"("id") ON DELETE SET NULL ON UPDATE CASCADE;
