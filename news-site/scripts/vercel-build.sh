#!/bin/sh
# Vercel build. Lives in a file rather than vercel.json because buildCommand is
# capped at 256 characters.
#
# Prisma needs DIRECT_URL for `migrate deploy`, but hosts name the direct
# (unpooled) connection string differently — Neon uses DATABASE_URL_UNPOOLED,
# Vercel Postgres uses POSTGRES_URL_NON_POOLING — and none of them set
# DIRECT_URL. Rather than make that a manual dashboard step, derive it here.
#
# directUrl is read ONLY by the Prisma CLI (migrate/introspect), never by the
# query engine, so setting it for the build alone is sufficient.
set -e

# Match the direct-connection variable whatever PREFIX the host gave it. Vercel's
# marketplace integrations let you namespace the variables they create, so the
# same value can arrive as DATABASE_URL_UNPOOLED, POSTGRES_URL_NON_POOLING, or
# SUPABASE_DATABASE_URL_UNPOOLED. Matching on the suffix covers all of them
# without hardcoding one installation's choice.
if [ -z "${DIRECT_URL:-}" ]; then
  DIRECT_URL="$(env | sed -n 's/^[A-Za-z0-9_]*DATABASE_URL_UNPOOLED=//p' | head -n 1)"
fi
if [ -z "${DIRECT_URL:-}" ]; then
  DIRECT_URL="$(env | sed -n 's/^[A-Za-z0-9_]*POSTGRES_URL_NON_POOLING=//p' | head -n 1)"
fi
# Last resort: the pooled URL. Migrations over a pooler can fail, but failing
# with a real connection string beats failing with nothing.
if [ -z "${DIRECT_URL:-}" ]; then
  DIRECT_URL="${DATABASE_URL:-}"
fi

# Export only a real value. Exporting "" would override Prisma's own .env
# loading and turn a clear "not set" error into a confusing empty-string one.
if [ -n "${DIRECT_URL:-}" ]; then
  export DIRECT_URL
else
  unset DIRECT_URL
fi

prisma generate
prisma migrate deploy
next build
