-- Scheduled publishing: an article can be "scheduled" to auto-publish at a future
-- UTC instant (drained by /api/cron/publish-due), with the Facebook auto-share
-- firing THEN to the stored page ids. Additive + nullable; existing rows untouched.
ALTER TABLE "Article" ADD COLUMN "scheduledAt" TIMESTAMP(3);
ALTER TABLE "Article" ADD COLUMN "autoSharePageIds" TEXT;

CREATE INDEX "Article_status_scheduledAt_idx" ON "Article"("status", "scheduledAt");
