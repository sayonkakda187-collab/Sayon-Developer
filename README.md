# Pinterest Downloader Tool

Installable Pinterest photos and videos downloader with:

- Browser PWA mode for Android, iPhone/iPad home screen, and desktop install flows
- Local Node server for Pinterest parsing and media proxying
- Optional Electron desktop shell

## Features

- Single URL, multiple URL, and extract URL input modes
- Validation for Pinterest pin links
- Media preview queue with thumbnails, file size, and status
- Save-folder picker for local PC downloads
- Optional subfolders by date, board, and media type
- File naming controls and duplicate handling
- Batch downloads with live progress updates
- Download summary, retry actions, and JSON log export

## Run As PWA

```bash
npm.cmd install
npm.cmd start
```

Open [http://localhost:4173](http://localhost:4173) in a browser. `localhost` is treated as a secure context for service workers during development.

## Publish

### Recommended: Render

This repo includes [render.yaml](C:\Users\Sayon\Documents\Tool Downloads Pin\render.yaml) for an easy web-service deploy.

1. Push this project to GitHub.
2. Create a new Render account and connect the GitHub repo.
3. Choose `Blueprint` deploy or create a new `Web Service`.
4. Render will use:
   - `buildCommand`: `npm install`
   - `startCommand`: `npm start`
5. After deploy, open the generated `https://...onrender.com` URL.
6. For production branding, add your custom domain in Render.

Notes:
- The app must be served over HTTPS in production for install prompts and service workers.
- The included Render config uses the free plan for easy testing. Switch plans if you need production uptime/performance.

## Run As Desktop App

```bash
npm.cmd run start:desktop
```

## Verification

```bash
npm.cmd run check
```

## Notes

- Public Pinterest content works best. Private or unavailable pins are shown as failed items.
- The PWA caches the app shell and can open offline, but internet is still required to fetch Pinterest media.
- For production install prompts, serve the app over HTTPS.
- Direct folder saving in browser mode uses the File System Access API when available. Other browsers fall back to browser-managed downloads.
