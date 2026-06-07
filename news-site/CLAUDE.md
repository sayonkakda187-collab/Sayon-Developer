# CLAUDE.md — General News Publishing Website

Project rules and roadmap for the news site. **Read this file first** and follow
its conventions before writing any code.

> Location note: this app lives in the `news-site/` subdirectory of the
> `Sayon-Developer` repo (the repo root holds an unrelated Pinterest tool). All
> paths below are relative to `news-site/`.

## What we are building

A general news publishing website (all topics). An admin publishes articles;
visitors read, browse by category, search, and comment.

## Stack (do not change without asking)

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** — light + dark themes via CSS-variable design tokens (`darkMode: "class"`)
- **Prisma** ORM with **PostgreSQL** (local via Docker Compose; Neon / Vercel Postgres in production)
- **Markdown**: `react-markdown` + `remark-gfm` render `Article.content` (added in Phase 2; renders no raw HTML, so it's XSS-safe)
- **Fonts**: Fraunces (display) + Inter (body) via `next/font`. **Motion**: vanilla CSS (`transform`/`opacity`) + a tiny `Reveal` IntersectionObserver component — no animation library; always honor `prefers-reduced-motion`.
- Server Components by default; Client Components only where interactivity needs it.

### Database (PostgreSQL)

PostgreSQL in every environment (local = Docker, production = Neon / Vercel
Postgres). The provider is `postgresql`; the connection is env-driven —
`DATABASE_URL` (pooled, runtime) and `DIRECT_URL` (direct, used for migrations).

- Local: `docker compose up -d` (see `docker-compose.yml`), then
  `npm run db:migrate && npm run db:seed`.
- Production / deploy: see `DEPLOY.md`.

## Conventions

- TypeScript everywhere; prefer Server Components and server-side data fetching.
- Import the shared Prisma client from `@/lib/db` — never instantiate `PrismaClient` directly elsewhere.
- The `@/*` path alias maps to the project root (`news-site/`).
- Keep the design clean, modern, magazine-style: light/dark themes, strong typography, mobile-first, accessible, fast.
- `status` and `role` are stored as strings: Article status is `"draft" | "published"`; User role is `"admin"`.
- Slugs are unique and URL-safe; auto-generate them from titles/names.
- Don't add new dependencies without asking first.
- After finishing a phase, report what's done + how to test, then update the roadmap checkboxes below.

## Folder structure

```
news-site/
  app/            # routes (App Router) — public pages + /admin + route handlers
  components/     # shared React components
  lib/            # db client + server utilities
  prisma/         # schema.prisma, migrations, seed.ts
  public/uploads/ # local-dev image upload fallback (gitignored)
```

## Database models

- **Article**: id, title, slug, excerpt, content (markdown), coverImage, status (draft/published), views, publishedAt, createdAt, updatedAt, categoryId, tags[]
- **Category**: id, name, slug, description
- **Tag**: id, name, slug
- **Comment**: id, articleId, authorName, content, createdAt, approved
- **User** (admin): id, email, passwordHash, role
- **Newsletter**: id, email, createdAt

(`tags[]` is modeled as a many-to-many relation between Article and Tag.)

## Pages & features

### Public
- **Home** `/` — featured hero + a **Trending-style feed**: a prominent search box,
  **category tab pills** (Top + real DB categories that filter the cards in place,
  with a "See all" link to the category page), and a **responsive 3/2/1 card grid**
  (`components/HomeFeed.tsx` over a larger `feed` pool from `getHomepage()`).
- **Article** `/news/[slug]` — full article + view counter + related (same category) + comments
- **Category** `/category/[slug]` — paginated **NewsCard** grid (3-col)
- **Search** `/search?q=` — server-side search over title + content, **NewsCard** grid
- **`NewsCard`** (`components/NewsCard.tsx`) — the shared trending-style card (cover
  on top, category + time, headline, excerpt, hover lift); used on home/category/search.
  `ArticleCard` remains for the article page's related stories.
- **Theme:** light/dark via the `.dark` class + RGB design tokens; the toggle +
  `localStorage` persistence are unchanged, but a first-time visitor with no stored
  choice now defaults to **dark** (the polished default; set pre-paint in
  `app/layout.tsx`'s `themeInit`). The public token system is separate from the
  admin `.adm-*` system — the redesign reuses **public** tokens, never admin CSS.
- Responsive header (nav + category menu) and footer with newsletter signup
- Newsletter signup (dedupe emails)
- Comments: visitors post (name + text), stored unapproved, only approved shown
- Full SEO: per-page meta + Open Graph, `sitemap.xml`, `robots.txt`, semantic HTML, image optimization

### Admin (`/admin`, login-protected)
- Session-based auth (email + password); protect all `/admin` routes
- Dashboard: total articles, total views, total comments
- Articles: list / create / edit / delete; markdown editor + image upload; set category + tags; draft/publish; auto unique slugs
- Categories & tags management
- Comments moderation: approve / delete

## Local commands

```bash
docker compose up -d  # local PostgreSQL (see docker-compose.yml)
npm run dev           # start dev server (http://localhost:3000)
npm run build         # production build
npm run db:migrate    # create/apply a migration (prisma migrate dev)
npm run db:deploy     # apply migrations without prompts (production)
npm run db:seed       # seed sample data + dev admin
npm run db:reset      # drop, re-migrate, and re-seed
npm run db:studio     # open Prisma Studio
```

Environment: copy `.env.example` → `.env` (defaults point at the local Docker Postgres). Deployment: see `DEPLOY.md`.

## Admin & auth (Phase 3)

- **Login:** `/admin/login`. Default seeded credentials: `admin@example.com` / `admin1234` (override before seeding with `ADMIN_EMAIL` / `ADMIN_PASSWORD`).
- **Sessions:** stateless, HMAC-signed httpOnly cookie (`AUTH_SECRET`); passwords hashed with Node `scrypt`. No external auth dependency.
- **Route protection:** `app/admin/(panel)/layout.tsx` calls `requireAdmin()`; the login page lives outside that group so it isn't gated. Admin API routes check `getSessionUser()` directly.
- **Mutations:** Server Actions in `app/admin/actions.ts` (each re-checks `requireAdmin`).
- **Image uploads:** **Vercel Blob** when `BLOB_READ_WRITE_TOKEN` is set (required on Vercel — read-only filesystem); otherwise a `/public/uploads` fallback for local dev. Blob public URLs are allow-listed in `next.config.mjs`.
- **Cover image cropper:** selecting/dropping a cover (or **Adjust / reframe** on an
  existing one) opens `components/admin/CoverCropModal.tsx` — a **dependency-free**
  cropper (Pointer Events: drag to reposition, pinch / wheel / slider to zoom;
  fully touch-capable). On **Apply** it canvas-crops to a **1200px-wide JPEG**
  (q≈0.9) and uploads that via the **existing `/api/admin/upload`** flow, setting
  it as `coverImage`. Default aspect is **1.91:1 (1200×630)** — the OG / Facebook
  share-card ratio — with **16:9** and **4:3** presets; so the chosen framing is
  exactly what the article hero and the shared link show. Cancel keeps the prior
  cover; a tainted-canvas / upload failure shows a clear error and keeps it too.
- **Free stock photos (cover image):** the cover area has **"Search free photos"**
  + **"Suggest from title"** (`components/admin/StockPhotoModal.tsx` →
  `GET /api/admin/stock-photos` (`requireAdmin`) → `lib/stockPhotos.ts`). Provider
  is **Pexels** (free, no card, ~200 req/hr, simplest license — no mandatory
  download ping). **License-cleared images only — never news-source images.**
  Searches are **cached ~30 min** server-side to protect the rate limit; quota/
  auth/network errors degrade to friendly messages; an unset `PEXELS_API_KEY`
  shows a "set up photos" state (manual upload still works). Picking a photo opens
  it in the **existing cropper** (cropped result → Blob via `/api/admin/upload`),
  so nothing is hotlinked. Photographer credit is stored on the article
  (`coverCredit` / `coverCreditUrl`, additive migration) and shown small on the
  public hero. Key is **server-side only**.
- **Mobile (admin):** the admin is **mobile-first** — base styles target phones,
  and desktop layout lives behind a single `@media (min-width: 1024px)` block in
  `app/globals.css`. The shell uses a **bottom tab bar** (or `?nav=drawer`), a
  frosted app bar, and a slide-in drawer. A consolidated **`@media (max-width:
  1023px)` hardening block** guarantees ≥44px tap targets, no horizontal
  overflow (long URLs/IDs wrap, media capped at 100%), modals become **bottom
  sheets**, and the editor gets a **sticky Save/Publish bar** (`.adm-editbar`).
  Keep new admin UI working at 320–414px; respect `prefers-reduced-motion`.

## Ads (AdsKeeper)

The article reading page (`/news/[slug]`) and the homepage (`/`) have AdsKeeper
ad placements wired up. Everything is config-driven from **one file:
`lib/ads.ts`** — that's the only file you edit to go live.

**To go live (3 steps in `lib/ads.ts`):**
1. Paste your **SITE ID** (the number from your head loader URL
   `https://jsc.adskeeper.com/site/SITE_ID.js`) into `ADSKEEPER_SITE_ID`.
2. In the AdsKeeper dashboard → **Add Widget**, create one widget per placement
   and paste each **WIDGET ID** into `ADS.IN_ARTICLE`, `ADS.RECOMMENDED`,
   `ADS.HOME`.
3. Set `ADS_ENABLED = true`.

Until all three are done, **real visitors see nothing** (clean page, no empty
boxes). Labeled dashed placeholder boxes marking each slot show in **local dev**
and on **Vercel preview** deployments (keyed off `NEXT_PUBLIC_VERCEL_ENV`), so
you can review the placements before adding IDs — but never on the production
domain. No DB/auth/backend involvement — these IDs are public and safe to commit.

**How it's built:**
- `components/AdsHead.tsx` — loads the AdsKeeper preloader once via `next/script`
  (`afterInteractive`), only on the public site (mounted in `(public)/layout.tsx`,
  never in `/admin`), and only when enabled with a real SITE ID.
- `components/AdSlot.tsx` — `<AdSlot widgetId={…} />` renders the AdsKeeper body
  container (`data-type="_mgwidget"`) and lazily triggers `_mgq.push(["_mgc.load"])`
  via IntersectionObserver. Reserves `minHeight` (no layout shift), carries an
  "Advertisement" label, and matches the site tokens in light/dark. **Collapses
  cleanly** (renders nothing) if the network doesn't fill the slot within ~8s —
  so an unfilled unit never leaves an empty box (important now that a slot sits
  above the headline).
- **Placement on `/news/[slug]`:** a **TOP-of-page unit ABOVE the headline +
  cover** (just under the site header) — **IN_ARTICLE_TOP** — for maximum
  visibility, per the owner's requested layout. It uses **`2030046`** — the **same
  Header Widget as the homepage HOME slot** — so opening a full story shows the
  same card row at the top, matching the homepage (a different page from `/`, so
  sharing the id is fine). Then an optional in-body
  **IN_ARTICLE** unit after the opening (~4th paragraph; short pieces, <4
  paragraphs, skip it; placeholder until you add a widget id), and at the end the
  **RECOMMENDED** unit (`2029928`) after the body, before comments — it fills once
  that widget is Active in AdsKeeper, else it collapses. A widget fills only ONE
  slot per page, so the top and end units must use **different** ids. Single-column
  (no sidebar). ⚠️ A top-of-content ad maximises visibility but pushes the story
  down — this **reverses** the earlier reader-first "no ad above the story" choice
  **at the owner's request**.
- Placement on `/` (homepage): **HOME** at the **very top, above the featured
  hero** (the first thing on landing) — a Header Widget using **`2030046`**
  (responsive single row: 4 cards on desktop / 2 on mobile), reserving 300px so it
  never jumps the hero down when it fills; collapses cleanly if unfilled.
  `IN_ARTICLE` stays a placeholder (renders nothing in prod) until you add a
  widget id.

## Facebook Pages integration (Graph API)

Distribute published articles to Facebook Pages from the admin panel using the
**official Graph API only** — no scraping, headless browsers, or login
simulation anywhere. All Graph calls are server-side; tokens never touch the
browser.

**Two-step Share flow (default Facebook tab screen):** `FacebookShareFlow`
(`components/admin/FacebookShareFlow.tsx`) renders **Step 1 — select Page(s)**
(selectable cards w/ avatar + status + post counts; multi-select checkboxes,
pre-selected when only one Page; **grouped by category/niche — each group is its
own box with a per-group "Select all / Unselect all"**, mirroring the manager's
`adm-fb-grouphd`, plus a name/group search **and a "Move to group" control in a
sticky toolbar** (reassigns the ticked pages between niches via
`setFacebookPagesGroup` — so you can organize Pages without leaving this view) +
a global select-all; Connect/Refresh
in the header) → **Step 2 — pick a published article** (server action
`listPublishedArticlesForShare`: search
+ pagination, published-only) with a "Sharing to: […] · Back" bar, then an
**editable caption + cover preview** → posts to each selected Page **one at a
time** via the existing `publishArticleNow` (Graph path) with **live per-page
status** (posting/✓/✗) so one failure never blocks the rest, a summary, and a
success screen. The detailed **Pages manager** (grouped table, per-page
refresh/disconnect, category groups) stays rendered below. Each row's **Category
Group** cell is an inline **move selector** — pick another group (or "＋ New
group…") to reassign that Page via `setFacebookPageGroup`, and it jumps to the
target group box on refresh. Each row also has an **Issue** selector ("Limited
post" / "Post failed" / "Verify identity" / custom, from `lib/facebookIssues.ts`):
flagging a Page (`setFacebookPageIssue`, nullable `FacebookPage.issue`) pulls it
into a red **"Needs attention"** box at the top of the manager — independent of
the token `status`; null = healthy — and clearing it returns the Page to its
niche box. For organizing many Pages at once, rows have **checkboxes** + a
per-box **"Select all"**, and a **Move** control sits in the **sticky search
toolbar** (next to the search box: "N selected · Move to …", disabled until you
tick pages) that reassigns every ticked Page in one `setFacebookPagesGroup`
(`updateMany`) call — handy for sorting a large "Uncategorized" pile.
`ConnectModal` was extracted to `FacebookConnectModal.tsx` and is shared by the
flow + the manager. The per-article editor panel (`ArticleFacebookPanel`) is also
unchanged. The browser-**Sessions** capture card was removed from the Facebook
tab per request; the runner backend (`lib/fbRunner.ts` + its server actions)
remains for the article editor's optional runner-posting options.

**Spacing multi-page posts:** when sharing one article to several Pages, the flow
posts **sequentially with a configurable gap** between pages — presets
(None / 30s / 1m / 2m / 5m) or a custom seconds value, **default 1 min**, optional
**±25% jitter** ("Vary a little"), remembered in `localStorage`. It shows a **live
countdown** before each next page and a **Stop** button to cancel the remaining
queue; one page failing never stops the rest. It is **client-driven** (the tab
must stay open until it finishes) — chosen over a server-side queue for the live
countdown/cancel UX; a single page selected posts immediately (no delay). Honest
note: a delay **reduces** spam-flag risk but is a **courtesy, not a guarantee** —
reasonable posting volume + original content are the real protection.

**Server-side scheduling (fires while offline):** Step 2 offers **Post now** or
**Schedule**. Scheduling writes `ScheduledPost` rows (status `pending`, optional
`caption`, `scheduledFor` in UTC) via `scheduleArticleShares`; the existing
**Vercel Cron** `/api/cron/facebook-post` (`vercel.json`; **daily by default** for
Hobby compatibility — set to `*/5 * * * *` on Pro for at-the-minute firing)
drains due rows, **atomically claims** each (`pending → posting` via `updateMany`,
so it never double-posts even if runs overlap), posts via the Graph API with the
stored page token + caption, and marks `posted` (+`graphPostId`) / `failed`
(+reason). Times are entered in **Asia/Phnom_Penh** (fixed +07:00, no DST) and
stored UTC (`lib/fbSchedule.ts`); **same time for all** or **per-page times**. A
**Scheduled posts** manager (`FacebookScheduledPosts`) lists upcoming/past with a
status filter and **edit / cancel (→ canceled) / delete** for pending rows.
Immediate posting (incl. the multi-page delay) is unchanged.
- **Env:** set **`CRON_SECRET`** in Vercel — the cron is **fail-closed** (refuses
  to run in production without it; Vercel Cron sends it as `Authorization:
  Bearer`).
- ⚠️ **Frequent cron needs Vercel Pro.** Hobby **rejects sub-daily cron at deploy
  time**, so `vercel.json` ships the daily `0 14 * * *` (deploys everywhere). For
  scheduled posts to fire at the chosen minute, **upgrade to Pro and set
  `*/5 * * * *`** — until then the cron only drains due posts once/day.
- **Migration:** `20260605120000_scheduled_post_caption` adds
  `ScheduledPost.caption` (auto-applies via `prisma migrate deploy`).
- Honest: scheduling relies on Vercel Cron + a **long-lived** page token; if the
  token expires, scheduled posts fail with a "reconnect" reason until you refresh
  it in **Facebook Pages**. Facebook's own **Meta Business Suite Planner** also
  offers free native scheduling. This schedules **my own** articles to **my own**
  pages via the official Graph API — not mass automation.

**Architecture decision (do NOT replace with browser automation):** posting goes
directly to `/{pageId}/feed` with that Page's own access token, so the target
Page is **exact by construction** — there is no shared "logged-in session" or
"current page" to switch. A Playwright/Puppeteer bot driving a logged-in
facebook.com session was explicitly rejected because (1) it violates Facebook's
ToS and risks the **personal account being disabled** (taking all Pages with it),
and (2) a persistent browser process can't run on this **Vercel serverless**
host. The **Page Selector** dropdown + "Currently posting to: [Page]" label give
the same UX (choose a page, confirm the target) on the safe Graph API path.

**Optional self-hosted browser runner (`/fb-runner`):** for users who still want
manual-session posting, a **standalone Node service** (NOT part of this app —
it can't run on Vercel) keeps a persistent, manually-logged-in Chromium alive
(Playwright) and posts by automating the FB UI. It lives at the repo root so CI
(which only builds `news-site/**`) never touches it. The app talks to it via
`lib/fbRunner.ts` over HTTP **only when `FB_RUNNER_URL` + `FB_RUNNER_TOKEN` are
set**; otherwise the Graph API is used unchanged. When configured, the Facebook
panel adds a "Browser runner" posting method (`publishArticleNow({ via: "runner" })`).
The runner is **opt-in and at-your-own-risk** (ToS/account-ban). Graph API code
is **not** removed — the two coexist.

**Browser-runner Page discovery + multi-Page posting (no Graph token).** The
article editor's Facebook panel (when the runner is configured) can **"Load my
Pages"** — `discoverRunnerPages()` → `runnerPages()` → the runner's `GET /pages`
(`listPages(state)`) scrapes every Page the logged-in account manages. It runs in
an **ephemeral context off the saved session** (the on-disk session file or a
passed `state`), so it works on a **headless server** (the old `listPages` only
read the headed-login profile). The admin then ticks several Pages and posts the
article to all of them; the client calls `publishArticleToPageUrl` **once per Page,
sequentially** (the runner drives one browser, and one request per Page keeps each
under the route's `maxDuration = 60`). No connected `FacebookPage` row or Page
token is needed — only the captured browser session.

**Security model**
- Page access tokens are **encrypted at rest** (AES-256-GCM, `lib/crypto.ts`).
  The key derives from `ENCRYPTION_KEY` (falls back to `AUTH_SECRET`); in
  production one of them is **required** or encryption throws. Tokens are only
  decrypted server-side at post/validate time.
- The Facebook App secret and tokens are **never** exposed to the client.
- All routes/actions are **admin-only** (reuse `requireAdmin()`).
- The cron route is secured by `CRON_SECRET` (Bearer header); if unset in
  production it refuses to run (fail closed).

**Data model** (`prisma/schema.prisma`)
- `FacebookPage`: pageId, pageName, **encrypted** accessToken, categoryGroup
  (niche), status (`Connected`|`Expired`), lastSyncedAt.
- `ScheduledPost`: links Article ↔ FacebookPage with scheduledFor, status
  (`pending`|`posting`|`posted`|`failed`), postedAt, error, graphPostId. Doubles
  as post history.

**Code map**
- `lib/crypto.ts` — AES-256-GCM encrypt/decrypt for secrets.
- `lib/facebook.ts` — Graph API wrapper: `validatePageToken`, `postToPage`
  (`POST /{pageId}/feed` with message+link), `exchangeForLongLivedUserToken`,
  `permalinkForPost`. Categorizes expired/invalid tokens (codes 190/102/…).
- `lib/facebookPublish.ts` — single publish chokepoint (decrypt → post → update
  page status) shared by "Publish now" and the cron.
- `lib/facebookGroups.ts` — niche group list + sort helper.
- `app/admin/facebook-actions.ts` — server actions (connect/refresh/disconnect/
  publishNow/schedule/cancel), all `requireAdmin()`.
- `app/api/cron/facebook-post/route.ts` — Vercel Cron runner. Atomically claims
  due rows (`updateMany pending→posting`) for **idempotency** (no double-posts),
  posts via Graph, records status/postedAt/error, never crashes on one failure.
- UI: `/admin/facebook` (grouped table + Connect modal + toasts) and the
  "Publish to Facebook Pages" panel on the article edit page (per-niche
  checkboxes, Publish Now / Schedule, per-page results + post history).

**Cron / scheduling**
- `vercel.json` → `crons: [{ path: "/api/cron/facebook-post", schedule: "0 14 * * *" }]`
  — once daily at 14:00 UTC, which the **Vercel Hobby (free)** plan supports
  (Hobby allows only daily cron). Due scheduled posts publish at the next daily
  run, so exact-minute timing isn't guaranteed.
- For near-exact timing (e.g. `*/15 * * * *`) upgrade to **Vercel Pro**, or keep
  Hobby and trigger `/api/cron/facebook-post` from an external scheduler
  (cron-job.org, a GitHub Action, …) with the `CRON_SECRET` bearer header.

**Env vars** (see `.env.example`): `ENCRYPTION_KEY` (or reuse `AUTH_SECRET`),
`CRON_SECRET`, optional `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET` (only for
short→long-lived token exchange), optional `FACEBOOK_GRAPH_VERSION`,
`NEXT_PUBLIC_SITE_URL` (canonical links in posts).

**Facebook setup (one time) — two ways to connect (`/admin/facebook` → Connect):**
- **Auto (recommended):** paste your **App ID + App Secret** (App Dashboard →
  Settings → Basic) and a short-lived **User token** from the Graph API Explorer
  (scopes `pages_show_list` + `pages_read_engagement` + `pages_manage_posts`; add
  `business_management` if your Pages are owned by a Business Manager).
  The server (`facebookFetchPages`) **exchanges it for a long-lived user token**
  (`exchangeForLongLivedUserToken`), calls **`GET /me/accounts`** (`getUserPages`)
  to list your Pages, you pick one, and `facebookConnectPage` stores that **Page
  token** (effectively non-expiring) encrypted. App ID/Secret + the long-lived
  user token live in `AppSetting` (secret + token **encrypted**; the user token's
  ~60-day expiry is stored non-secret and shown as "Connection valid until …";
  see `lib/facebookSettings.ts`); env `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET`
  still work as a fallback.
- **Manual:** paste a Page ID + a long-lived **Page access token** directly.

**Refresh Pages** (`facebookRefreshPages`, button on `/admin/facebook`): re-calls
`GET /me/accounts` with the stored long-lived user token to refresh every
connected Page's token/name **and auto-add Pages you created since** (filed under
"Uncategorized"). No re-pasting needed while the user token is valid.

Posting to Pages you don't own (or beyond dev mode) requires **App Review**.
The post caption is **editable** before sending (defaults to `buildMessage`); the
article link is attached separately so Facebook renders its OG preview. Multi-page
posts space Graph calls ~300ms apart and surface rate-limit errors (codes
4/17/32/341/613 or HTTP 429) as a clear "wait a few minutes" message — never a
silent hammer or crash.

> 🔐 **Token hygiene:** App Secret + all tokens are encrypted at rest and never
> sent to the browser or logged. **If a token (or the App Secret) was ever
> exposed — e.g. pasted into a screenshot or chat — regenerate it immediately**
> (App Dashboard rotates the App Secret; Graph Explorer re-issues user tokens),
> then reconnect in Settings. A leaked Page token can post as your Page until
> revoked.

## Share / Promote panel (manual, no token)

A lightweight, **no-automation** complement to the Graph-API poster above:
helps the admin hand-share a **published** article to Facebook (and copy assets
for anywhere). No API/token, no scraping — it just assembles copy-ready text and
opens Facebook's official **sharer** dialog.

- **Where:** opens (1) **right after publishing** — `saveArticle` redirects to
  `/admin/articles?published={id}` and the list auto-opens the panel with an
  "Article published! 🎉" header; (2) **anytime** — a Share row action on every
  published article in the list, and a **Share** button in the editor action bar
  for published articles. Drafts have no public URL → the panel shows a "publish
  first" hint (the list/editor only surface Share for published rows).
- **What it shows (for the selected published article):** cover image preview
  with **Copy image** (Clipboard API → PNG via canvas) + **Download**; the
  **headline**, the **public canonical URL**, and an editable **caption**
  (headline + hook + link), each with a Copy button + "Copied!" toast; a **Copy
  everything** (caption + link) and a **Share to Facebook** button that opens
  `facebook.com/sharer/sharer.php?u={encoded URL}` in a new tab.
- **Correctness:** a server action `getShareInfo(id)` (`app/admin/share-actions.ts`,
  `requireAdmin`) is the single source of truth — it reuses `articleUrl(slug)`
  (the same canonical URL the Graph poster uses) and the saved `coverImage`, so
  the link/title/image **match the page's Open Graph tags** Facebook scrapes.
- **Resilience:** clipboard + download degrade gracefully (select-text / open in
  new tab) when blocked. Fully responsive. Code:
  `components/admin/SharePromoteModal.tsx`. **Env:** none new — uses
  `NEXT_PUBLIC_SITE_URL` (already documented) for absolute URLs.

## Trending News (multi-source aggregation)

Admin-only tool to discover trending headlines and start an **original** draft
from one. **Inspiration only** — it surfaces headlines + short snippets + the
source link; it never copies article text into posts (copyright). Distribution
of full content is the writer's job, in their own words.

**Aggregation (lib/news/):** combines several FREE news APIs into one **deduped**
feed. Each provider maps its response into one `NormalizedItem` (title,
description, source, url, image, publishedAt, `via`); sources are fetched **in
parallel with a 6s timeout each** (`Promise.allSettled`-style), then merged and
deduped by canonical URL + fuzzy title (Jaccard ≥ 0.82), keeping the richest copy
and sorting by most-recent. A **source selector** (chips) lets the admin toggle
sources on/off and shows per-source status (count / "limit reached" / "not set
up"). **Graceful degradation:** a missing-key / errored / rate-limited source
contributes nothing and the feed still works on the others — one source never
breaks the page.

**Sources + FREE-tier ceilings** (all keys **server-side only**, each optional —
unset = skipped, not an error):
| Source | Env var | Free tier |
|---|---|---|
| GNews | `GNEWS_API_KEY` | ~100 req/day · 10 articles/req |
| NewsData.io | `NEWSDATA_API_KEY` | ~200 credits/day · 10/req |
| TheNewsAPI | `THENEWSAPI_KEY` | ~100 req/day · **3 articles/req** |
| Currents | `CURRENTSAPI_KEY` | ~600 req/day (dev) |

**Honest note:** these are all **limited free tiers** — combining them maximizes
free coverage but still has ceilings; truly high volume needs a **paid plan** on
one provider. **NewsAPI.org is intentionally NOT integrated:** its free tier is
Developer-only and **blocked on production/live domains** (localhost only).
Mediastack is skipped too (free tier is HTTP-only → breaks on HTTPS, ~100/mo).

**Caching / quota discipline**
- Each source is **cached in-memory ~20 min** per query+category+lang+country+page
  (`lib/news/fetcher.ts`), so a combined feed doesn't multiply requests. A 429
  backs that source off (serving its cache + the other sources); stale-while-error
  keeps the feed alive. The page degrades to an "add a key" note when **no** source
  is configured.

**Code map**
- `lib/news/sources.ts` — client-safe source registry (ids, labels, env vars,
  free-tier notes) shared by the route + the source selector.
- `lib/news/normalize.ts` — `NormalizedItem` + `mergeAndDedupe()` (URL + fuzzy
  title dedupe, recency sort). `lib/news/fetcher.ts` — per-source cache, quota
  backoff, `timedFetch`. `lib/news/providers/*` — one module per API (gnews wraps
  the existing `getTrending`; newsdata, thenewsapi, currents). `lib/news/aggregate.ts`
  — parallel orchestration + per-source status.
- `lib/gnews.ts` — unchanged GNews client (`getTrending` + `toTrendingItem`); its
  own cache/quota/pagination still drive GNews and "Load more".
- `app/api/admin/trending/route.ts` — admin-only; accepts `?sources=` (enabled
  ids) and returns `{ items, sources[] }`; keys stay on the server.
- `app/admin/(panel)/trending/page.tsx` + `components/admin/TrendingNews.tsx` —
  category chips + search, responsive card grid, loading skeletons, empty/error
  states, and an always-visible "write original content" note.
- **"Write article about this"** links to `/admin/articles/new?title=…&ref=…`,
  **reusing the existing editor/`saveArticle` flow** (no separate publish path).
  The new draft is seeded with the headline as a working title and a *research
  note* linking the source (to delete before publishing) — **no source text is
  copied** into the body.

**AI Assist (paid, opt-in)**
- An **"AI Assist"** button on each trending card (and an AI banner inside the
  editor when a draft arrives from it) opens a modal that calls
  `POST /api/admin/ai-assist` (`requireAdmin`) → `lib/aiAssist.ts`, which calls
  the **Anthropic Messages API** (raw `fetch`, no SDK). It sends only the
  **headline + topic** — never scraped source text — and returns 5 sections:
  **brief, suggested headlines, outline, background & angles, original first
  draft** (each with a copy button). Runs **only on an explicit click** (cost
  control); never automatic.
- **Guardrails:** the system prompt forces ORIGINAL writing from general
  knowledge (no copying/close paraphrase, no fabricated quotes/stats, `[VERIFY:
  …]` placeholders, neutral news tone). A visible disclaimer sits above the
  output. **"Use as draft"** stashes the draft in `sessionStorage` and opens the
  editor (`/admin/articles/new?ai=1`, read by `ArticleForm`'s `aiHandoff`) as an
  **unsaved** draft — never auto-published. `ANTHROPIC_API_KEY` is **server-side
  only**; if unset the button shows a "Set up AI" state instead of erroring.
- Code: `lib/aiAssist.ts` (`generateAiAssist`, `isAiConfigured`),
  `app/api/admin/ai-assist/route.ts`, `components/admin/AiAssistModal.tsx`.

**AI Assist · edit article (editor):** the article editor has its own **"AI
Assist"** button (`components/admin/ArticleAiEditModal.tsx`) that edits the
admin's OWN draft. Quick actions (improve / fix grammar / shorten / expand /
polish tone / better headline) **and** a free-form instruction box →
`POST /api/admin/ai-assist` with `mode:"edit"` → `editArticle()` in
`lib/aiAssist.ts` (sends the current title+body + instruction). It previews the
revision; **Apply** writes it into the editor as an **unsaved** change (autosave
+ undo still apply) — never auto-saves or publishes. Same originality guardrails.

**Model picker:** both AI panels show a dropdown — **Haiku 4.5 / Sonnet 4.6 /
Opus 4.8** (`lib/aiModels.ts`, the allow-list the route validates against),
remembered per-browser (`lib/useAiModel.ts`). The picked model is sent per
request; `ANTHROPIC_MODEL` is just the fallback default.

**Env:** trending sources (all free, server-side, each optional): `GNEWS_API_KEY`,
`NEWSDATA_API_KEY`, `THENEWSAPI_KEY`, `CURRENTSAPI_KEY`. `ANTHROPIC_API_KEY`
(**paid**, pay-per-use; server-side) + optional `ANTHROPIC_MODEL` (fallback
default; the in-app picker overrides it). Add in Vercel for Production + Preview.
See `.env.example`.

## News Search (paid metasearch + API Settings)

A separate, provider-backed search **alongside** (not replacing) the free Trending
feed. Adds a **"News Search"** tab on the Trending page — keyword + category +
region + language search via a **paid** provider — and an **"API Settings"** admin
page to manage keys.

- **Providers:** **SerpApi (Google News)** primary, **NewsAPI.org** alternative;
  the admin picks the active one. `lib/newsSearch/search.ts` normalizes each into
  the same card shape (headline, source, link, snippet, time, image), caches per
  (provider+query+category+region+lang+page) **~20 min** to protect paid quota,
  uses a 6–9s timeout, and maps **rate-limit/quota** errors to friendly messages
  with stale-cache fallback. Cards reuse the trending **AI Assist** + **"Write
  article"** flow + the **"Inspiration only"** framing.
- **API Settings (`/admin/settings`):** paste + save each key (server action →
  **encrypted at rest** via `lib/crypto.ts` AES-256-GCM in the new **`AppSetting`**
  table) or use an env fallback (`SERPAPI_KEY` / `NEWSAPI_KEY`). A **DB key takes
  priority over env**. Keys are **never** returned to the browser — the UI only
  shows configured/not-configured status. Resolution + status live in
  `lib/newsSearch/settings.ts`; the route is `app/api/admin/news-search/route.ts`
  (`requireAdmin`). Nav: "API Settings" in the sidebar + mobile drawer (not the
  bottom tab bar).
- **⚠️ Honesty (also shown in the UI):** **SerpApi is PAID** (only ~100 free-trial
  searches). **NewsAPI's free tier is development-only** (blocked on a live site) —
  production needs its paid plan. So real production use needs a **paid key**; the
  **free Trending feed** (GNews + aggregated free APIs) stays available, and free
  options (NewsData.io / TheNewsAPI) live there.
- **DB migration:** additive `AppSetting` (encrypted key-value store);
  `20260601080000_app_settings`. Auto-applies on deploy. **Env:** `SERPAPI_KEY` /
  `NEWSAPI_KEY` (optional fallbacks) + `ENCRYPTION_KEY` (already required to
  encrypt secrets at rest).

## AdsKeeper earnings (publisher REST API — MGID platform)

A dashboard **"Ad Earnings · AdsKeeper"** panel showing **real** ad stats —
revenue, impressions, clicks, CTR, eCPM, CPC — for a selectable range (Today / 7
/ 30 days / This month), a **revenue-over-time** chart, a **per-website**
breakdown, and a **payout-progress** bar toward AdsKeeper's **$100** minimum
(only when the API returns a balance). Self-fetching client panel
(`components/admin/AdskeeperPanel.tsx`) so the dashboard loads instantly.

- **Auth function (MGID/AdsKeeper REST platform):** account **login + password**
  are exchanged server-side at the auth function for a short-lived **32-char
  token** (`{ token, idAuth }`); the token is sent as `Authorization: Bearer` and
  **re-requested on expiry/401**. The token is cached in-process (~45 min). An
  alternative path accepts a ready **API token + Client/Publisher ID (idAuth)**.
  Storage (`lib/adskeeper/settings.ts`): **password + token encrypted at rest**
  (`AppSetting`, AES-256-GCM); login + idAuth plain. Env fallback
  `ADSKEEPER_LOGIN` / `ADSKEEPER_PASSWORD` (or `ADSKEEPER_API_KEY` /
  `ADSKEEPER_CLIENT_ID`); **DB beats env**. Secrets are **server-side only**,
  never returned to the browser or logged. Settings UI: `AdskeeperSettings`.
- **Calls (documented endpoint):** `lib/adskeeper/client.ts` (server-only).
  `GET {base}/publishers/{authId}/widget-custom-report?dateInterval=<today|
  lastSeven|last30Days|thisMonth>&dimensions=<date|domain>&metrics=impressions,
  clicks,ctr,wage,eCpm,cpc&perPage=1000&timeZone=Asia/Phnom_Penh`. **`wage` is the
  revenue metric** (mapped → revenue). Two calls per range: `dimensions=date`
  (daily chart + totals) and `dimensions=domain` (per-website). CTR/eCPM/CPC are
  recomputed from summed totals. **30-min earnings cache** (Refresh forces fresh;
  saving creds clears it). Graceful states: not-configured, 401/403 → reconnect,
  429 → rate-limit, no-data, network. **Only ever shows real returned data.**
- **Direct-token mode (primary, no auth call):** when a **token + Client ID
  (idAuth)** are saved, the earnings fetch + Test connection call
  `widget-custom-report` **directly** with the token — skipping the auth/login
  step entirely (token takes priority over login+password). The `Authorization`
  header format is tried **`Bearer <token>` then raw `<token>`** on a 401/403, and
  the working variant is remembered. **Metric names are negotiated** (`negotiateMetrics`)
  — the default `metrics` set is sent first; on `VALIDATION_WRONG_PARAM_METRICS`
  the accepted name/casing per metric is probed (a baseline, then groups in
  parallel) and cached, self-healing if a combo is later rejected. Only
  impressions/clicks/revenue are required — CTR/eCPM/CPC are recomputed in
  `buildEarnings`, and `pick()` maps whatever revenue field returns → Revenue.
  **Test connection** (token mode) runs a small `today` report and shows the
  working header + sample revenue/impressions + the metrics used, or the **exact
  HTTP status + raw response body** (never swallowed) to forward to AdsKeeper
  support. `ADSKEEPER_AUTH_PATH` is **not** required for token mode.
- **⚠️ Auth path (only undocumented bit, login mode):** the help center doesn't
  publish the auth-function URL. `authenticate()` tries a small candidate set (`auth`,
  `token`, `auth/login`, `login`, `publishers/auth`; POST then GET) and locks onto
  whichever returns a token — or, set **`ADSKEEPER_AUTH_PATH`** /
  **`ADSKEEPER_AUTH_METHOD`** to pin it. The Settings **"Test connection"** button
  (`testAdskeeperConnection` → `probeAuth`) reports which path worked + the
  `idAuth`, without exposing the token. Note: this build environment's egress
  policy blocks `api.adskeeper.com` (`host_not_allowed`), so candidates must be
  probed from the deployed app, not locally. Other overrides:
  `ADSKEEPER_API_BASE` / `ADSKEEPER_REPORT_PATH` / `ADSKEEPER_TIMEZONE`.
- **DB migration:** none (reuses `AppSetting`). **Env:** `ADSKEEPER_LOGIN` /
  `ADSKEEPER_PASSWORD` (or `ADSKEEPER_API_KEY` / `ADSKEEPER_CLIENT_ID`) +
  `ENCRYPTION_KEY` (already required to encrypt secrets at rest).
- 🔐 If your AdsKeeper password/token is ever exposed (screenshot/chat), change it
  in AdsKeeper and re-save here.

## Audience analytics (visitor countries + devices)

A privacy-respecting **Audience** admin tab (`/admin/audience`, globe nav item)
showing which countries article readers come from — a world **bubble map** + a
ranked **flagged country list** (count + %) — plus a **device breakdown**
(mobile / desktop / tablet share), **overall or per-article**, with a
7 / 30-day / all-time range.

- **Tracking:** the public article server component reads Vercel's free
  **`x-vercel-ip-country`** geo header via `headers()` **and** a coarse device
  class from the User-Agent (Next's `userAgent({ headers })` → `device.type`,
  mapped to `mobile` / `desktop` / `tablet`; anything else → desktop), then passes
  both to `incrementViews(id, country, device)`. That adds two parallel upserts:
  **`ArticleCountryView`** (articleId, ISO alpha-2 `countryCode`, UTC `date`,
  `count`) and **`ArticleDeviceView`** (articleId, `device`, UTC `date`, `count`).
  **Privacy: counts only — no IP, no stored UA string, no PII**; the raw UA is
  parsed then discarded, missing/invalid country → `"ZZ"` (Unknown). No paid
  geo-IP service; same `Promise.all` as the existing view write.
- **Aggregation:** `getCountryStats({ articleId?, days? })` (groupBy country, sum)
  and `getDeviceStats({ articleId?, days? })` (groupBy device, sum), plus
  `getAudienceArticles()` (articles that have data). The admin-only server action
  `getAudienceStats` returns **both** (`{ stats, total, devices }`) and powers the
  client re-fetch on scope/range change.
- **Map:** dependency-free SVG **equirectangular bubble map** (`WorldBubbleMap` +
  `lib/countryCentroids.ts`) — faint base dots trace the continents, visitor
  countries get volume-sized bubbles + a flag/name/% tooltip. No map
  library/topojson (light bundle, theme-aware).
- **Devices:** a **Devices** card on the tab — a proportional split bar +
  per-device legend (count + %), and a **"Top device"** summary tile. It renders
  once per-device data exists (historical reads from before this feature have
  country data but no device split). `components/admin/AudienceDashboard.tsx`.
- **Helpers:** `lib/countries.ts` — alpha-2 → flag emoji (regional indicators) +
  `Intl.DisplayNames` name; `"ZZ"` → 🌐 Unknown. `lib/devices.ts` — device class →
  label + accent colour (pure, client-safe; shared by tracking + the dashboard).
- **Migrations:** `20260605140000_article_country_view` +
  `20260607120000_article_device_view` (both auto-apply, additive). **No env
  needed** — the Vercel geo header + the request User-Agent are automatic in
  production. ⚠️ Real country/device data only appears once **real visitors hit
  the deployed site** (localhost/preview with no geo header bucket as Unknown).
  Existing view tracking + the dashboard views chart are unchanged (the new
  upserts are additive).

## AI image generation (swappable provider: Cloudflare / Hugging Face / Gemini)

Generate illustrations from a text prompt and use them on articles. Available as
its own **"AI Images"** admin tab AND inside the article editor (generate a cover
for the piece you're writing). All calls are **server-side** — keys never reach
the browser; only the resulting image does.

> ⚠️ **NEWS-IMAGE SAFETY (shown in the UI + here):** this is a news site, so AI
> images must **NOT** be presented as real photographs of real news events
> (that's misinformation and risks ad-network approval). The generator UI shows a
> caution and defaults the **style toward clearly-illustrative output**; use AI
> images for **illustrations / concept art / stylized graphics** only. For real
> events, the **Pexels stock-photo search remains the better choice** — it's
> unchanged; AI images are an additional option, not a replacement.

- **Providers (swappable):** `lib/imageGen.ts` (`server-only`) — one chokepoint
  `generateImage(prompt, opts)` → `GeneratedImage[]` (base64). Three providers,
  selected by **`IMAGE_PROVIDER`** (`cloudflare` | `huggingface` | `gemini`) or
  **auto-detected** from whichever keys are present (`activeImageProvider()`):
  - **Cloudflare Workers AI** (recommended free) — `accounts/{id}/ai/run/{model}`,
    default **FLUX.1 [schnell]** (`@cf/black-forest-labs/flux-1-schnell`); handles
    both JSON-base64 and raw-bytes responses.
  - **Hugging Face Inference** (free) — `api-inference.huggingface.co/models/{model}`,
    default `black-forest-labs/FLUX.1-schnell`; a cold model → a "warming up, try
    again" message.
  - **Google Gemini / Imagen** — `:generateContent` (default
    `gemini-2.5-flash-image`) or `:predict` for an `imagen-*` `IMAGE_GEN_MODEL`.
  `isImageGenConfigured()` gates a tidy setup state; a typed `ImageGenError`
  (auth/quota/safety/network/parse/config) maps to HTTP + a friendly message, and
  **non-OK provider responses surface the verbatim error**. To add a provider,
  write another `generate*()` and branch in `generateImage`.
- **Keys (env, server-side only):** **Cloudflare** = `CLOUDFLARE_ACCOUNT_ID` +
  `CLOUDFLARE_API_TOKEN` (+ `CLOUDFLARE_IMAGE_MODEL`); **Hugging Face** =
  `HF_API_TOKEN` (+ `HF_IMAGE_MODEL`); **Gemini** = `GEMINI_API_KEY` (also
  `IMAGE_API_KEY`/`GOOGLE_AI_API_KEY`) + `IMAGE_GEN_MODEL`. See `.env.example` for
  where to get each. **No DB migration** — images live in **Vercel Blob** via the
  existing upload route.
- ⚠️ **Google free-tier caveat (2026):** Google tightened the free image tier —
  many keys return HTTP 429 **"limit: 0"** for image models (incl.
  `gemini-2.5-flash-image`) unless **billing** is enabled (then ~$0.039/image);
  **Imagen has no free tier**. So **Cloudflare Workers AI** or **Hugging Face** are
  the genuinely-free defaults; Gemini works best with billing on.
- **Route:** `app/api/admin/generate-image/route.ts` (`requireAdmin`, `nodejs`,
  `maxDuration=60`). GET → `{ configured }`; POST `{ prompt, aspectRatio, count,
  style }` → `{ ok, images:[{ url:dataURL, mimeType }] }`.
- **Admin tab** (`/admin/ai-images`, `AiImageGenerator`): prompt + aspect-ratio /
  style / count controls, Generate, loading, and a results grid. Per image:
  **Download**, **Save to media** (→ Blob via `/api/admin/upload` → copyable URL),
  **Copy URL**, **Use in a new article** (saves to Blob, hands the URL to a new
  draft's cover via a one-shot `sessionStorage` key, then opens the editor).
  Recent generations stay in memory for the session (data URLs aren't persisted —
  they'd blow `sessionStorage` quota). Nav: **footer group** (sidebar + mobile
  drawer, next to Sites/Settings) — deliberately **not** in the 7-item phone
  bottom bar to avoid crowding it.
- **Editor integration** (`AiImageModal`, opened by **"Generate with AI"** next to
  "Search free photos"): prompt → generate → pick a result → it's handed to the
  **existing `CoverCropModal`** as a **data URL** (data URLs don't taint the crop
  canvas), cropped to the OG ratio, uploaded to Blob, and set as `coverImage` —
  the **same pipeline** as uploads/stock photos. The client helpers live in
  `lib/imageGenClient.ts` (client-safe constants + `requestImages` +
  `saveImageToBlob`), shared by the tab and the modal. The cropper, manual upload,
  Pexels search, and `coverImage`/credit fields are all unchanged.
- **Resilience:** quota/safety/auth/network errors show the real message; an
  unset key shows "set up" (manual upload + stock still work). Responsive / PWA.
  Generated Blob URLs are already allow-listed in `next.config.mjs` (same host as
  cover uploads); the generator previews images via plain `<img>` (data/blob
  URLs), so no `next/image` host config is needed.

## Multi-site foundation (database + admin structure only)

Latent groundwork so additional news sites can be added **later** — **not** a
live second site. **Golden rule: the current site (dailyledger.today) keeps
working EXACTLY as before, as the DEFAULT site, with zero disruption.** All
existing articles/categories/comments/settings stay intact and visible. There is
**no domain routing, no per-site branding/ads/Facebook split yet** — only the
data model + admin scaffolding.

- **Data model** (`prisma/schema.prisma`): a new **`Site`** (id, name, unique
  `slug`, unique nullable `domain`, `isDefault`, `logo`/`title`/`description`
  branding **placeholders** (unused), timestamps) and a **nullable
  `Article.siteId`** FK (`onDelete: SetNull`, indexed `[siteId, status,
  publishedAt]`). **Categories and Tags are SHARED across sites** for now
  (simplest; revisit if a site needs its own taxonomy). `siteId` stays
  **nullable on purpose** and **null is treated as the default site** everywhere
  (`articleWhereForSite`), so any legacy/edge row can never be hidden.
- **Migration:** `20260606120000_sites` — additive + backfilled. Creates `Site`,
  seeds **one default** (`id "site_default"`, name "The Daily Ledger", slug
  `daily-ledger`, domain `dailyledger.today`, `isDefault true`), adds
  `Article.siteId`, **backfills every existing article to the default site**,
  then adds the index + FK. Auto-applies on deploy (`prisma migrate deploy`). No
  data loss; reversible in effect (drop column/table). **No env needed.**
- **Scoping helper** (`lib/sites.ts`, `server-only`): `getDefaultSite`,
  `listSites` (with per-site article counts; null-siteId rows count toward the
  default), `getActiveSiteId`/`getActiveSite` (validated `adm_site` cookie →
  else default), and `articleWhereForSite(site)` → for the **default** site
  `{ OR: [{ siteId }, { siteId: null }] }`, otherwise `{ siteId }`.
  `DEFAULT_SITE_ID = "site_default"`.
- **What is scoped (admin only, conservative):** the **admin Articles list**
  (`/admin/articles`) filters by the active site, and **new articles** get the
  active site's `siteId` on **create** (`saveArticle`; **updates never touch
  `siteId`**). With a single site this returns **exactly today's full list** and
  assigns everything to the default site — behavior is unchanged.
- **What is NOT scoped (left exactly as before, by design):** **all public
  reads** (home/article/category/search/sitemap/comments in `lib/queries.ts`),
  the **admin dashboard stats**, **admin search**, and **Facebook** share lists.
  One site → identical output; these get scoped only when a real second site
  ships.
- **Admin UI:** a **Sites** page (`/admin/sites`, `SitesManager`) lists sites
  (article counts, a **Default** pill) and adds a site (name / optional slug /
  optional domain, uniqueness-checked); the **default site can't be deleted**,
  and a site with articles can't be deleted (nothing orphaned). A **site
  switcher** (`SiteSwitcher`, in the sidebar + mobile drawer) picks the site
  you're managing, persisted in the **httpOnly `adm_site` cookie**
  (`setActiveSite`, scoped to `/admin`); it's a disabled read-only label until a
  second site exists. All actions are `requireAdmin()`.
- **Deliberately deferred (future work, do NOT assume present):**
  **domain→site routing** (map a request hostname → `Site` → scope public
  queries), **per-site branding** (logo/title/description), and **per-site ads /
  Facebook Pages**. When adding a second live site, wire public queries through
  `articleWhereForSite` (resolved from the host), and split ads/FB config per
  site — none of that is done here.

## Roadmap

Build in 4 phases, one at a time. Stop and report after each.

### Phase 1 — Setup + Database ✅
- [x] Next.js 14 + TypeScript + Tailwind initialized
- [x] Prisma configured with SQLite
- [x] Folder structure (`/app`, `/components`, `/lib`, `/prisma`)
- [x] Full Prisma schema (all models)
- [x] `lib/db.ts` single Prisma client
- [x] Seed data: 3 categories + 6 published articles with cover images (+ 8 tags)
- [x] Migration + seed run successfully

### Phase 2 — Public Pages ✅
- [x] Homepage (featured hero + latest grid + category sections)
- [x] `/news/[slug]` (full article, view counter, related, comments placeholder)
- [x] `/category/[slug]` (paginated)
- [x] `/search?q=` (server-side search over title + excerpt + content)
- [x] Responsive header (search + category nav) + footer with working newsletter signup

### Phase 3 — Admin Panel + Auth ✅
- [x] Session-based auth (scrypt + HMAC-signed httpOnly cookie); all `/admin` routes protected via the `(panel)` layout
- [x] Seed admin user (`admin@example.com` / `admin1234` by default)
- [x] Dashboard stats (articles, total views, comments, categories, subscribers)
- [x] Article CRUD + Markdown editor (live preview) + image upload + draft/publish + auto unique slugs
- [x] Manage categories & tags

### Phase 4 — Comments + Newsletter + SEO ✅
- [x] Comments: visitors post (stored unapproved) + admin approve/unapprove/delete at `/admin/comments` + only approved shown publicly
- [x] Newsletter signup (dedupe) — shipped early in Phase 2 (`/api/newsletter` + footer form)
- [x] SEO: per-page meta + Open Graph, `sitemap.xml` (`app/sitemap.ts`), `robots.txt` (`app/robots.ts`), semantic HTML, `next/image` optimization
