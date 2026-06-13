-- Page Control now uses its OWN MonitoredPagePostsCache, so the farm's
-- PagePostsCache (added in 20260612210000_page_posts_cache) is orphaned — nothing
-- reads or writes it. Drop it. Safe + additive-in-reverse (a read-only cache table
-- with no other dependents).
DROP TABLE IF EXISTS "PagePostsCache";
