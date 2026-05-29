# Deploying to Vercel

The news site is a standard Next.js 14 app in the **`news-site/`** subdirectory.
It needs a **PostgreSQL** database and, for admin image uploads, a **Vercel Blob**
store (Vercel's serverless filesystem is read-only, so local file writes don't
persist).

## 1. Create a PostgreSQL database (free options)

Pick one and grab its connection strings:

- **Neon** — https://neon.tech (free tier). Create a project, then copy both the
  **pooled** and the **direct** connection strings.
- **Vercel Postgres** — in your Vercel project's **Storage** tab; it exposes the
  connection strings as environment variables automatically.

You need two URLs:

| Use | Which string |
| --- | --- |
| `DATABASE_URL` | **pooled** (runtime) |
| `DIRECT_URL` | **direct / non-pooled** (migrations) |

## 2. Import the repo into Vercel

1. Vercel → **Add New… → Project** → import `sayonkakda187-collab/Sayon-Developer`.
2. **Root Directory:** set to **`news-site`** (click *Edit* and choose the folder).
   This is essential — the app is not at the repo root.
3. Framework preset **Next.js** is auto-detected; leave build/output defaults.

## 3. Set environment variables

Project → **Settings → Environment Variables** (add to Production and Preview):

| Variable | Value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | pooled Postgres URL | runtime connection |
| `DIRECT_URL` | direct Postgres URL | migrations |
| `AUTH_SECRET` | `openssl rand -hex 32` | required |
| `ADMIN_EMAIL` | your admin email | seeded admin |
| `ADMIN_PASSWORD` | a strong password | seeded admin |
| `BLOB_READ_WRITE_TOKEN` | from a Blob store (step 4) | image uploads |

## 4. Create a Vercel Blob store (image uploads)

1. Project → **Storage → Create → Blob**.
2. Connect it to the project — Vercel injects `BLOB_READ_WRITE_TOKEN` for you.

Without this, admin image uploads fail in production (read-only filesystem).

## 5. Apply migrations + seed the admin user

Run once against the **production** database (use the direct/non-pooled URL):

```bash
cd news-site
export DATABASE_URL="<direct-postgres-url>"
export DIRECT_URL="<direct-postgres-url>"
npx prisma migrate deploy          # apply committed migrations (no prompts)

ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="strong-pw" \
  NODE_ENV=production npm run db:seed
```

- `migrate deploy` applies the committed migration(s).
- `db:seed` inserts the sample categories/tags/articles and your admin user. To
  seed **only** the admin (no sample content), trim `prisma/seed.ts` first.

> Alternative: auto-migrate on deploy by setting the Vercel **Build Command** to
> `prisma migrate deploy && next build`.

## 6. Deploy

Trigger a deploy (push to the connected branch, or **Deploy** in the dashboard).
Once live:

- `/` — the public site
- `/admin/login` — sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`

## Local development

```bash
cd news-site
docker compose up -d     # local PostgreSQL (matches .env.example)
cp .env.example .env
npm install
npm run db:migrate       # apply migrations
npm run db:seed          # sample data + dev admin (admin@example.com / admin1234)
npm run dev              # http://localhost:3000
```
