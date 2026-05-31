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
- **Cover image cropper:** selecting/dropping a cover (or **Adjust / reframe** on an
  existing one) opens `components/admin/CoverCropModal.tsx` — a **dependency-free**
  cropper (Pointer Events: drag to reposition, pinch / wheel / slider to zoom;
  fully touch-capable). On **Apply** it canvas-crops to a **1200px-wide JPEG**
  (q≈0.9) and uploads that via the **existing `/api/admin/upload`** flow, setting
  it as `coverImage`. Default aspect is **1.91:1 (1200×630)** — the OG / Facebook
  share-card ratio — with **16:9** and **4:3** presets; so the chosen framing is
  exactly what the article hero and the shared link show. Cancel keeps the prior
  cover; a tainted-canvas / upload failure shows a clear error and keeps it too.

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

## Trending News (GNews discovery)

Admin-only tool to discover trending headlines and start an **original** draft
from one. **Inspiration only** — it surfaces headlines + short snippets + the
source link; it never copies article text into posts (copyright). Distribution
of full content is the writer's job, in their own words.

**Security / quota**
- `GNEWS_API_KEY` is read **server-side only** (`lib/gnews.ts`) and never sent to
  the browser. Get a free key at **gnews.io** (free tier: **100 requests/day**).
- Results are **cached in-memory ~20 min** per category/query so browsing and
  tab-switching reuse one upstream call instead of spending the daily quota.
- Rate-limit (429/403), bad-key (401), and network errors map to friendly
  messages; the page degrades to an "add your key" note when unset.

**Code map**
- `lib/gnews.ts` — server-only GNews client: `fetchTrending({category, query})`
  → `top-headlines` (category tabs) or `/search` (keyword). Returns a clean,
  typed `TrendingItem[]` (title, snippet, source, url, image, publishedAt) —
  deliberately **not** GNews's full `content` field.
- `app/api/admin/trending/route.ts` — admin-only (reuses `getSessionUser()`),
  returns clean JSON; the key stays on the server.
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
