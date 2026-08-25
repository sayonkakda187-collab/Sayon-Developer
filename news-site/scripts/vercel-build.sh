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

# Migrations must not take the whole deployment down with them.
#
# A failure here — unreachable database, missing DATABASE_URL, bad credentials —
# previously aborted the build, so the site kept serving an older deployment and
# the only record of WHY was inside Vercel's build log. That makes the problem
# hard to see for anyone who cannot easily reach those logs.
#
# Now the error is printed loudly and the build continues. The deployed site then
# reports the real database state as JSON at /api/admin/bootstrap, which is far
# easier to read than a build log. A site that deploys and says "database
# unreachable" beats a site that will not deploy at all.
#
# The app is safe either way: with no tables, pages return errors rather than
# wrong data, exactly as they do now.
if prisma migrate deploy; then
  echo "migrations: applied"
else
  # Capture the status FIRST — any command in between (an echo included) would
  # overwrite $? and report a successful exit code for a failure.
  migrate_status=$?
  echo "-------------------------------------------------------------------"
  echo "WARNING: prisma migrate deploy FAILED (exit ${migrate_status})."
  echo "The build continues so the site deploys and can report the problem."
  echo "Check /api/admin/bootstrap?secret=... on the deployed site."
  echo "-------------------------------------------------------------------"
fi

next build
