-- Tracks when an article was auto-shared to Facebook on publish (opt-in feature).
-- Set once; guards against re-enqueuing scheduled posts on re-publish/edit.
ALTER TABLE "Article" ADD COLUMN "autoSharedAt" TIMESTAMP(3);
