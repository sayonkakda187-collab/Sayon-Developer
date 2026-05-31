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
- **Home** `/` — featured hero + latest grid + category sections
- **Article** `/news/[slug]` — full article + view counter + related (same category) + comments
- **Category** `/category/[slug]` — paginated article list
- **Search** `/search?q=` — server-side search over title + content
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

## Ads (AdsKeeper)

The article reading page (`/news/[slug]`) and the homepage (`/`) have AdsKeeper
ad placements wired up. Everything is config-driven from **one file:
`lib/ads.ts`** — that's the only file you edit to go live.

**To go live (3 steps in `lib/ads.ts`):**
1. Paste your **SITE ID** (the number from your head loader URL
   `https://jsc.adskeeper.com/site/SITE_ID.js`) into `ADSKEEPER_SITE_ID`.
2. In the AdsKeeper dashboard → **Add Widget**, create one widget per placement
   and paste each **WIDGET ID** into `ADS.TOP`, `ADS.IN_ARTICLE`, `ADS.SIDEBAR`,
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
  "Advertisement" label, and matches the site tokens in light/dark.
- Placements on `/news/[slug]`: **TOP** (below the lede), **IN_ARTICLE** (split
  into the middle of the body at a paragraph boundary), **SIDEBAR** (above
  "Related Stories"; this layout is single-column).
- Placement on `/` (homepage): **HOME** (between the featured hero and the first
  content block / "Latest News"). Each placement needs its **own** widget id —
  don't reuse `ADS.TOP` here, or it won't fill.

## Facebook Pages integration (Graph API)

Distribute published articles to Facebook Pages from the admin panel using the
**official Graph API only** — no scraping, headless browsers, or login
simulation anywhere. All Graph calls are server-side; tokens never touch the
browser.

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

**Facebook setup (one time):** create a Facebook App (Business), add the page(s)
under a Page-token flow, grant `pages_manage_posts` + `pages_read_engagement`
(and `pages_show_list`), generate a **long-lived Page access token**, then paste
the Page ID + token into the Connect dialog. Posting to Pages you don't own (or
beyond dev mode) requires **App Review** for those permissions.

## Admin article search (my-articles)

Powerful in-house search over the admin's own articles — no external limits.
`searchArticlesAdmin(query, { limit })` in `lib/queries.ts`, exposed via
`app/api/admin/articles/search/route.ts` (`requireAdmin()`-gated). Matches across
**title, excerpt, content, category name, and tag names**, case-insensitive,
substring, word-order tolerant; **relevance-ranked** (title > excerpt > category
> tag > body) with recency tiebreak and highlighted snippets (`«…»` → `<mark>`).
Debounced input; backed by **pg_trgm GIN indexes** (migration
`20260531140000_article_search_trgm`; schema enables `previewFeatures =
["postgresqlExtensions"]` + `extensions = [pg_trgm]`). Surfaced in the admin
top/app bar (`components/admin/GlobalSearch.tsx`, ⌘F) and the Articles list
filter. Distinct from the **public** `/search` (`searchArticles`, published-only).

## Trending News (GNews discovery + planning + AI Assist)

Admin-only tool to discover trending headlines, **plan coverage**, and start an
**original** draft from one. **Inspiration only** — it surfaces headlines + short
snippets + the source link; it never copies article text into posts (copyright).
The page has a **Discover | Saved ideas** switch to keep things uncluttered.

**GNews security / quota**
- `GNEWS_API_KEY` is read **server-side only** (`lib/gnews.ts`, `import
  "server-only"`) and never sent to the browser. Free tier: **100 requests/day**,
  **≤10 articles/request**, no pagination. We request `max=10` and never promise
  more. Keyword search uses `sortby=relevance` + `in=title,description`.
- Results are **cached in-memory ~20 min** per query/category/lang/country/page;
  **stale-while-error** serves cache on a failed fetch; a 429/quota signal backs
  off until UTC midnight. The ceiling is the data source — *more* results/sources
  need a **paid GNews plan**, not code.

**Part A — content planning (all client-side over already-fetched data → zero
extra GNews calls, except where noted):**
- **Save for later** — bookmark a story (per-admin `SavedIdea` table) that
  survives refresh; a "Saved ideas" view manages them (status idea→drafting→done,
  delete) and "Turn into draft" reuses the Write-article prefill.
- **Already-covered badge** — fuzzy-matches a headline against existing article
  titles (`lib/trendingClient.ts`, Jaccard + substring); informs, never blocks.
- **Trending keywords panel** — top terms across loaded headlines; click to search.
- **Sort + source filter** — reorder / hide sources on the loaded results.
- **More niches** — Politics, Finance, AI/Tech, Crypto, Lifestyle, **Cambodia**
  (search-backed tabs in `TRENDING_CATEGORIES`; reuse the 20-min cache).
- **Follow topics** — per-admin `FollowedTopic` table for quick re-search chips.
- Server actions: `app/admin/trending-actions.ts` (all `requireAdmin()`,
  per-admin via `userId`). *(Phase 2: a date/time recency filter.)*

**Part B — AI Assist (PAID, opt-in):**
- An **"AI Assist"** button on each card (and saved idea) opens a modal that
  calls `POST /api/admin/ai-assist` (`requireAdmin()`) → `lib/aiAssist.ts`, which
  calls the **Anthropic Messages API** (raw fetch, no SDK). It sends only the
  **headline + topic** — never scraped source text — and returns 5 sections:
  **brief, suggested headlines, outline, background & angles, original first
  draft**. Runs **only on click** (cost control); never automatic.
- **Guardrails:** the system prompt forces ORIGINAL writing from general
  knowledge (no copying/close paraphrase, no fabricated quotes/stats, `[VERIFY:
  …]` placeholders, neutral tone). A visible disclaimer sits above the output.
  **"Use as draft"** stashes the draft in `sessionStorage` and opens the editor
  (`/admin/articles/new?ai=1`) as an **unsaved** draft (with an AI banner) —
  never auto-published. `ANTHROPIC_API_KEY` is **server-side only**; if unset the
  button shows a "Set up AI" state instead of erroring.

**Code map**
- `lib/gnews.ts` — server-only GNews client: `getTrending({category, query, lang,
  country, page})` + `toTrendingItem()`; niche tabs resolve to curated search
  queries. Clean `TrendingItem` (no full `content` field).
- `lib/trendingClient.ts` — client-safe `trendingKeywords()` + `isAlreadyCovered()`.
- `lib/aiAssist.ts` — server-only Anthropic client (`generateAiAssist`,
  `isAiConfigured`); `app/api/admin/ai-assist/route.ts` — admin-only route.
- `app/admin/trending-actions.ts` — per-admin saved ideas + followed topics.
- `app/admin/(panel)/trending/page.tsx` + `components/admin/TrendingNews.tsx` +
  `components/admin/AiAssistModal.tsx`.
- **"Write article"** → `/admin/articles/new?title=…&ref=…`, reusing the editor /
  `saveArticle` flow; the draft is seeded with a working title + a research note
  linking the source — **no source text is copied**.

**Env:** `GNEWS_API_KEY` (free; server-side). `ANTHROPIC_API_KEY` (**paid**,
pay-per-use; server-side) + optional `ANTHROPIC_MODEL` (defaults to the cheapest
capable model). Add both in Vercel for Production + Preview. See `.env.example`.

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
