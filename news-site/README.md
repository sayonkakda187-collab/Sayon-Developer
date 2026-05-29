# The Daily Ledger — News Publishing Website

A full-stack general news site where an admin publishes articles and visitors
read, browse by category, search, and comment. Built with **Next.js 14** (App
Router), **TypeScript**, **Tailwind CSS**, and **Prisma** + **SQLite**
(upgradeable to PostgreSQL).

> See [`CLAUDE.md`](./CLAUDE.md) for full conventions, the data model, and the
> build roadmap.

## Features

- **Public:** magazine homepage (featured hero + latest grid + category
  sections), article pages with Markdown, view counter, related stories and
  comments, paginated category pages, server-side search, responsive
  header/footer, newsletter signup.
- **Admin** (`/admin`, login-protected): dashboard stats, full article CRUD with
  a Markdown editor (live preview + image upload), draft/publish, auto-generated
  unique slugs, category & tag management, and comment moderation.
- **SEO:** per-page metadata + Open Graph, `sitemap.xml`, `robots.txt`,
  semantic HTML, and `next/image` optimization.

## Getting started

```bash
npm install            # install dependencies (runs `prisma generate`)
cp .env.example .env   # configure environment (defaults to SQLite)
npm run db:reset       # create + migrate + seed the database
npm run dev            # http://localhost:3000
```

### Admin login

After seeding, sign in at **`/admin/login`**:

- **Email:** `admin@example.com`
- **Password:** `admin1234`

(Override before seeding with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars, and
set a strong `AUTH_SECRET` in production.)

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run db:migrate` | Create & apply a migration |
| `npm run db:seed` | Seed sample data |
| `npm run db:reset` | Drop, re-migrate, and re-seed |
| `npm run db:studio` | Open Prisma Studio |

## Tech notes

- **Auth:** session is an HMAC-signed httpOnly cookie; passwords hashed with
  Node `scrypt` (no external auth dependency).
- **Markdown:** rendered with `react-markdown` + `remark-gfm` (no raw HTML).
- **Image uploads:** saved to `/public/uploads` (local filesystem). For
  serverless/read-only hosts, swap in object storage (S3/R2/etc.).
- **Database:** to move to PostgreSQL, change the `datasource` provider in
  `prisma/schema.prisma` to `postgresql`, point `DATABASE_URL` at your database,
  and run a fresh migration — no model changes required.

## Project structure

```
app/            # routes: (public) pages, /admin, route handlers, sitemap, robots
components/     # shared + admin React components
lib/            # db client, auth, queries, slug + markdown helpers
prisma/         # schema, migrations, seed
public/uploads/ # admin image uploads (gitignored)
```
