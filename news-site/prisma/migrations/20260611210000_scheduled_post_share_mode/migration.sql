-- "Photo + link in comments" share mode on Facebook share records: which mode was
-- used, the link-comment id, and a commentError set when the post landed but the
-- comment didn't (retryable from the Share Center). Additive + nullable; legacy
-- rows stay null (= "link").
ALTER TABLE "ScheduledPost" ADD COLUMN "mode" TEXT;
ALTER TABLE "ScheduledPost" ADD COLUMN "commentId" TEXT;
ALTER TABLE "ScheduledPost" ADD COLUMN "commentError" TEXT;
