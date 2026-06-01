# fb-runner — self-hosted Facebook posting runner

A standalone Node service that keeps **one persistent, manually-logged-in Chromium
browser** alive and posts to your Facebook Pages by automating the website. The
admin panel sends it commands over HTTP.

> **Why this is separate from the website.** The Next.js admin app runs on
> **Vercel serverless** — functions cold-start and die in seconds with a
> read-only filesystem, so a long-lived logged-in browser **cannot** run there.
> This runner is meant to run on a machine you control (your laptop, a VPS, a
> home server). The website keeps its **Graph API** posting as the default; the
> browser runner is an *alternative* you opt into by pointing the app at it.

## ⚠️ Read before using

- **Against Facebook's Terms.** Automating a logged-in facebook.com **user**
  session is not permitted and can get your **personal account checkpointed or
  disabled** — which takes every Page with it. Use at your own risk.
- **Fragile by nature.** Facebook changes its HTML often. The selectors here are
  best-effort with fallbacks, and every step fails loudly with a clear message,
  but a layout change can still break posting until selectors are updated.
- The **official Graph API path remains** in the app and is the recommended,
  account-safe option. Prefer fixing Graph API issues over this when possible.

## Setup

```bash
cd fb-runner
npm install            # installs Playwright + Chromium (postinstall)
cp .env.example .env   # then edit .env and set FB_RUNNER_TOKEN
# (or skip .env and just: export FB_RUNNER_TOKEN="$(openssl rand -hex 24)")
npm start
```

First run, log in by hand:

```bash
TOKEN=$FB_RUNNER_TOKEN
curl -s -XPOST localhost:4350/login -H "x-runner-token: $TOKEN"   # opens a window
# → complete login (incl. 2FA) in the Chromium window. Session persists to ./profile
curl -s localhost:4350/status -H "x-runner-token: $TOKEN"          # {"loggedIn":true}
curl -s localhost:4350/pages  -H "x-runner-token: $TOKEN"          # your manageable Pages
```

## Endpoints (all require `x-runner-token`, except `/health`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Reachability probe (no auth). |
| GET | `/status` | `{ loggedIn }`. |
| POST | `/login` | Open a visible browser to log in manually (persisted). |
| GET | `/pages` | List Pages the account manages. |
| POST | `/post` | `{ pageUrl, pageName, message, imageBase64? }` → switch to the page + post. |

Errors return `{ ok:false, code, error }` with a specific `code`
(`not_logged_in`, `composer_not_found`, `post_button_not_found`,
`post_unconfirmed`, …) so the admin panel can show exactly what failed.

## Env

| Var | Default | Notes |
|---|---|---|
| `FB_RUNNER_TOKEN` | — | **Required.** Shared secret; must match `FB_RUNNER_TOKEN` in the web app. |
| `FB_RUNNER_PORT` | `4350` | Listen port. |
| `FB_RUNNER_HOST` | `127.0.0.1` | Bind address. Keep localhost unless tunneled/VPN'd. |
| `FB_PROFILE_DIR` | `./profile` | Persistent browser profile (your session). Keep private; gitignored. |
| `FB_HEADLESS` | _(headed)_ | `1` to run hidden once login works. |

## Connecting the admin panel

In the web app's environment set **`FB_RUNNER_URL`** (e.g. `http://127.0.0.1:4350`
or your tunnel URL) and **`FB_RUNNER_TOKEN`** (same value as here). The Facebook
panel then offers a **Browser runner** posting option that calls this service;
without `FB_RUNNER_URL` the app uses the Graph API as before.
