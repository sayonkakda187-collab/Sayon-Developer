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

# Same problem as DIRECT_URL, one level up: DATABASE_URL itself may be missing or
# hold something that is not a connection string (the variable NAME gets pasted
# instead of the value surprisingly often — the copy control sits next to the
# name, and integration variables are secrets whose value cannot be revealed).
# Prefer a pooled/Prisma-shaped URL, matching on the suffix so any prefix works.
case "${DATABASE_URL:-}" in
  postgres://*|postgresql://*) ;;
  *)
    for suffix in POSTGRES_PRISMA_URL POSTGRES_URL DATABASE_URL_UNPOOLED POSTGRES_URL_NON_POOLING; do
      candidate="$(env | sed -n "s/^[A-Za-z0-9_]*${suffix}=//p" | grep -E '^postgres(ql)?://' | head -n 1)"
      if [ -n "$candidate" ]; then
        echo "NOTE: DATABASE_URL was unusable; using a connection string from *${suffix}."
        DATABASE_URL="$candidate"
        export DATABASE_URL
        break
      fi
    done
    ;;
esac

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
# Last resort: the pooled URL — but only if it is actually a Postgres URL.
# Inheriting a malformed DATABASE_URL here is what silently broke migrations:
# DIRECT_URL took the bad value before DATABASE_URL had been repaired.
if [ -z "${DIRECT_URL:-}" ]; then
  case "${DATABASE_URL:-}" in
    postgres://*|postgresql://*) DIRECT_URL="${DATABASE_URL}" ;;
  esac
fi

# Export only a real value. Exporting "" would override Prisma's own .env
# loading and turn a clear "not set" error into a confusing empty-string one.
if [ -n "${DIRECT_URL:-}" ]; then
  export DIRECT_URL
else
  unset DIRECT_URL
fi

# Keep the runtime migration bundle in step with prisma/migrations. Generating
# it here means a new migration can never ship with a stale bundle, no matter
# whether anyone remembered to run the script by hand.
node scripts/gen-migrations.mjs

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
