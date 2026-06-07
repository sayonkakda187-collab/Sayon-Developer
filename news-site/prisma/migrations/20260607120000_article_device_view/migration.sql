-- Per-device-type visitor counts for the admin Audience analytics. Privacy-
-- respecting: counts only (no IP/UA/PII), keyed by article + device class
-- (mobile|desktop|tablet) + UTC day. The device class is derived from the request
-- User-Agent at read time and immediately discarded — only the bucket is kept.
CREATE TABLE "ArticleDeviceView" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "articleId" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ArticleDeviceView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArticleDeviceView_articleId_device_date_key" ON "ArticleDeviceView"("articleId", "device", "date");
CREATE INDEX "ArticleDeviceView_device_idx" ON "ArticleDeviceView"("device");
CREATE INDEX "ArticleDeviceView_date_idx" ON "ArticleDeviceView"("date");

ALTER TABLE "ArticleDeviceView" ADD CONSTRAINT "ArticleDeviceView_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
