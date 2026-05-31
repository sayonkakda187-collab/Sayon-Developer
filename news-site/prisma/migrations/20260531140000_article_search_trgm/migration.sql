-- Enable trigram matching for fast case-insensitive substring (ILIKE) search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes powering the admin article search across these fields.
-- Postgres uses these for `ILIKE '%term%'` predicates (Prisma `contains`).
CREATE INDEX IF NOT EXISTS "Article_title_trgm_idx"   ON "Article" USING GIN ("title"   gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Article_excerpt_trgm_idx" ON "Article" USING GIN ("excerpt" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Article_content_trgm_idx" ON "Article" USING GIN ("content" gin_trgm_ops);
