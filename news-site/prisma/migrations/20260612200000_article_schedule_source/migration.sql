-- Optional label for where a scheduled article came from (e.g. "Auto-Pilot 12:00
-- run"), shown in the Scheduled list. Null for manual / agent-approved schedules.
-- Additive + nullable.
ALTER TABLE "Article" ADD COLUMN "scheduleSource" TEXT;
