-- Optional operational issue flag for a connected Facebook Page (e.g. "Limited
-- post", "Post failed", "Verify identity"). Null = healthy. Surfaces the Page in
-- the admin Pages manager's "Needs attention" box, independent of token status.
-- Additive + nullable — no backfill needed.
ALTER TABLE "FacebookPage" ADD COLUMN "issue" TEXT;
