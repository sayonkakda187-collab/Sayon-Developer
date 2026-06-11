-- "Key Points" summary for an article: a handful of short, original bullet
-- points (newline-separated) rendered in a box near the top of the article.
-- Additive + nullable, so existing rows are unaffected (null = no box).
ALTER TABLE "Article" ADD COLUMN "keyPoints" TEXT;
