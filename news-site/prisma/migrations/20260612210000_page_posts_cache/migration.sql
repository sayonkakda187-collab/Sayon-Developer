-- ~6h cache of a Page's REAL published posts (first page of ~15) for the new
-- Page Control → Content view, so opening a Page's dashboard doesn't re-hit the
-- Graph API each time (essential at hundreds of Pages on Vercel Hobby). One row
-- per Page; `data` is a small JSON snapshot { posts: PagePost[], after: cursor }.
CREATE TABLE "PagePostsCache" (
    "facebookPageId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagePostsCache_pkey" PRIMARY KEY ("facebookPageId")
);

ALTER TABLE "PagePostsCache" ADD CONSTRAINT "PagePostsCache_facebookPageId_fkey" FOREIGN KEY ("facebookPageId") REFERENCES "FacebookPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
