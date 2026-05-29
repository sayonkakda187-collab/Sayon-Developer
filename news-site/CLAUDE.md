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
- **Tailwind CSS** (light theme only)
- **Prisma** ORM with **SQLite** (upgradeable to PostgreSQL — see below)
- **Markdown**: `react-markdown` + `remark-gfm` render `Article.content` (added in Phase 2; renders no raw HTML, so it's XSS-safe)
- Server Components by default; Client Components only where interactivity needs it.

### Upgrading SQLite → PostgreSQL later

Change `provider` in `prisma/schema.prisma` from `"sqlite"` to `"postgresql"`,
set `DATABASE_URL` to a Postgres connection string, then run a fresh migration.
No model changes required.

## Conventions

- TypeScript everywhere; prefer Server Components and server-side data fetching.
- Import the shared Prisma client from `@/lib/db` — never instantiate `PrismaClient` directly elsewhere.
- The `@/*` path alias maps to the project root (`news-site/`).
- Keep the design clean, modern, magazine-style: light theme, strong typography, mobile-first, accessible, fast.
- `status` and `role` are stored as strings (SQLite has no enums): Article status is `"draft" | "published"`; User role is `"admin"`.
- Slugs are unique and URL-safe; auto-generate them from titles/names.
- Don't add new dependencies without asking first.
- After finishing a phase, report what's done + how to test, then update the roadmap checkboxes below.

## Folder structure

```
news-site/
  app/            # routes (App Router) — public pages + /admin + route handlers
  components/     # shared React components
  lib/            # db client + server utilities
  prisma/         # schema.prisma, migrations, seed.ts, dev.db (gitignored)
  public/         # static assets + uploaded images
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
npm run dev         # start dev server (http://localhost:3000)
npm run build       # production build
npm run db:migrate  # create/apply a migration (prisma migrate dev)
npm run db:seed     # seed sample data
npm run db:reset    # drop, re-migrate, and re-seed
npm run db:studio   # open Prisma Studio
```

Environment: copy `.env.example` → `.env` (defaults to SQLite at `prisma/dev.db`).

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

### Phase 3 — Admin Panel + Auth
- [ ] Session-based auth; all `/admin` routes protected
- [ ] Seed admin user
- [ ] Dashboard stats
- [ ] Article CRUD + markdown editor + image upload + draft/publish + auto slugs
- [ ] Manage categories & tags

### Phase 4 — Comments + Newsletter + SEO
- [ ] Comments: post (unapproved) + admin approve/delete + show approved only
- [x] Newsletter signup (dedupe) — shipped early in Phase 2 (`/api/newsletter` + footer form)
- [ ] SEO: per-page meta + Open Graph (articles/categories done in Phase 2 via Next Metadata), `sitemap.xml`, `robots.txt`, image optimization (`next/image` done)
