# fb-runner — Quickstart (copy-paste)

> `fb-runner` is a **folder**, not a command. You can't type `fb-runner` in a
> terminal — you `cd` into this folder and run it with `npm`. Keep **Terminal 1**
> running the whole time; use **Terminal 2** for the login/verify commands.

Prereqs: **Node 22+** and **git** installed (`node -v`, `git --version`).

---

## 🪟 Windows (PowerShell)

> In PowerShell, `curl` is an alias for a *different* tool — use the native
> `Invoke-RestMethod` shown below (or call `curl.exe` explicitly).

### Terminal 1 — install & start
```powershell
# Clone once (skip if you already have the repo), then enter the runner folder
git clone https://github.com/sayonkakda187-collab/Sayon-Developer.git
cd Sayon-Developer\fb-runner

npm install                      # Playwright + Chromium (one-time)
Copy-Item .env.example .env      # make your config

# Generate a strong token (uses Node, which you already have):
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"

notepad .env                     # paste the token as FB_RUNNER_TOKEN, save & close
npm start                        # → "fb-runner listening on http://127.0.0.1:4350"
```

### Terminal 2 — log in once & verify
```powershell
$env:TOKEN = "paste-the-same-token-here"
$h = @{ "x-runner-token" = $env:TOKEN }

# 1) Open the browser → log into Facebook BY HAND (email + password + 2FA)
Invoke-RestMethod -Method Post -Uri http://localhost:4350/login -Headers $h

# 2) Confirm login (→ loggedIn : True) and list your Pages
Invoke-RestMethod -Uri http://localhost:4350/status -Headers $h
Invoke-RestMethod -Uri http://localhost:4350/pages  -Headers $h

# Health check (no token needed)
Invoke-RestMethod -Uri http://localhost:4350/health
```

---

## 🍎🐧 macOS / Linux (bash/zsh)

### Terminal 1 — install & start
```bash
git clone https://github.com/sayonkakda187-collab/Sayon-Developer.git
cd Sayon-Developer/fb-runner

npm install
cp .env.example .env
openssl rand -hex 24             # copy this into .env as FB_RUNNER_TOKEN
nano .env                        # paste the token, save & close
npm start
```

### Terminal 2 — log in once & verify
```bash
export TOKEN="paste-the-same-token-here"
curl -X POST localhost:4350/login -H "x-runner-token: $TOKEN"   # log in by hand
curl localhost:4350/status -H "x-runner-token: $TOKEN"          # {"loggedIn":true}
curl localhost:4350/pages  -H "x-runner-token: $TOKEN"
curl localhost:4350/health                                      # no token needed
```

---

## Connect the web app (optional, run it locally too)

In `news-site/.env.local` add the **same** token:
```ini
FB_RUNNER_URL="http://127.0.0.1:4350"
FB_RUNNER_TOKEN="paste-the-same-token-here"
```
Then `cd news-site && npm run dev` → open an article → the **Posting method**
dropdown appears → choose **Browser runner**.

> ⚠️ Production **Vercel cannot reach `localhost`** on your PC. To drive the
> runner from production you must expose it with a public tunnel
> (`cloudflared tunnel --url http://127.0.0.1:4350`) and put that HTTPS URL in
> Vercel's `FB_RUNNER_URL`. See `README.md`. Posting only works while your PC +
> runner + tunnel are running.

## Gotchas
| Symptom | Fix |
|---|---|
| `fb-runner : not recognized` | It's a folder — `cd` into it and use `npm start`. |
| `401 unauthorized` | Token in Terminal 2 must match `FB_RUNNER_TOKEN` in `.env`. |
| Port 4350 in use | Change `FB_RUNNER_PORT` in `.env` (and the URLs above). |
| `curl` acts weird (Windows) | Use `Invoke-RestMethod` or `curl.exe`, not the `curl` alias. |
| Chromium won't download | Behind a proxy: set `HTTPS_PROXY`, or run `npx playwright install chromium`. |
| `not_logged_in` later | Session expired — re-run the `/login` step. |
