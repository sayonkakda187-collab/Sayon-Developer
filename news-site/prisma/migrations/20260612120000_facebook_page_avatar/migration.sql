-- Cache each Page's profile picture so admin lists don't re-resolve it via the
-- Graph API on every render. `avatarUrl` is the public Facebook CDN URL (no token
-- in it); `avatarFetchedAt` drives the ~7-day refresh. Both nullable/additive.
ALTER TABLE "FacebookPage" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "FacebookPage" ADD COLUMN "avatarFetchedAt" TIMESTAMP(3);
