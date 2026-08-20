-- Point the default site at the new primary domain.
--
-- The site moved from dailyledger.today to ledgerdailynews.com. Site.domain is
-- currently descriptive only (domain -> site routing is deliberately deferred,
-- see CLAUDE.md), so this just keeps the Sites admin page accurate. Scoped to
-- the seeded default site and safe to re-run.
UPDATE "Site"
SET "domain" = 'ledgerdailynews.com',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'site_default'
  AND ("domain" IS DISTINCT FROM 'ledgerdailynews.com');
