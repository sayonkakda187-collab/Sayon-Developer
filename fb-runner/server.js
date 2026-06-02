// HTTP control surface for the persistent-browser runner. The admin panel (or a
// curl/CLI) sends commands here; this process keeps ONE logged-in browser alive
// and drives it. Plain Node http (no framework) to keep deps to just Playwright.
//
// Auth: every request must send `x-runner-token: <FB_RUNNER_TOKEN>` matching this
// process's env. Bind to localhost by default; if you expose it, put it behind a
// tunnel/VPN + keep the token secret. This runner must NOT run on Vercel — it
// needs a long-lived process + real filesystem (see README).

import http from "node:http";
import { writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  isLoggedIn,
  openForLogin,
  exportSession,
  importSession,
  validateSession,
  listPages,
  postToPage,
  ManualActionError,
} from "./browser.js";

const PORT = Number(process.env.FB_RUNNER_PORT || 4350);
const HOST = process.env.FB_RUNNER_HOST || "127.0.0.1";
const TOKEN = process.env.FB_RUNNER_TOKEN || "";

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null; // signal malformed body
  }
}

/** Map a thrown error to { status, code, error }. */
function errorResponse(e) {
  if (e instanceof ManualActionError) {
    const conflict = ["not_logged_in", "session_expired", "no_login"];
    const status = conflict.includes(e.code) ? 409 : e.code === "bad_request" ? 400 : 502;
    return { status, body: { ok: false, code: e.code, error: e.message } };
  }
  return { status: 500, body: { ok: false, code: "unknown", error: e?.message || "Runner error." } };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Health check is unauthenticated so the admin panel can probe reachability.
  if (req.method === "GET" && url.pathname === "/health") {
    return send(res, 200, { ok: true, service: "fb-runner", version: 1 });
  }

  // Everything else requires the shared token.
  if (!TOKEN || req.headers["x-runner-token"] !== TOKEN) {
    return send(res, 401, { ok: false, code: "unauthorized", error: "Bad or missing x-runner-token." });
  }

  try {
    if (req.method === "GET" && url.pathname === "/status") {
      // Don't force the headed persistent browser here — isLoggedIn() launches it
      // only when needed (no session file). This keeps /status working on a
      // headless server that posts off a session file.
      return send(res, 200, { ok: true, loggedIn: await isLoggedIn() });
    }

    if (req.method === "POST" && url.pathname === "/login") {
      const r = await openForLogin();
      return send(res, 200, { ok: true, ...r });
    }

    // Export the live login session (storageState JSON) so the app can back it up.
    if (req.method === "GET" && url.pathname === "/session/export") {
      const r = await exportSession();
      return send(res, 200, { ok: true, ...r });
    }

    // Re-check a saved session in an ephemeral context: still logged in?
    if (req.method === "POST" && url.pathname === "/session/validate") {
      const body = await readJson(req);
      if (!body || !body.state) return send(res, 400, { ok: false, code: "bad_request", error: "Missing session state." });
      const r = await validateSession(body.state);
      return send(res, 200, { ok: true, ...r });
    }

    // Install a session FILE so a headless server can post without a manual login.
    if (req.method === "POST" && url.pathname === "/session/import") {
      const body = await readJson(req);
      if (!body || !body.state) return send(res, 400, { ok: false, code: "bad_request", error: "Missing session state." });
      const r = await importSession(body.state);
      return send(res, 200, { ok: true, ...r });
    }

    // GET → use the runner's on-disk session; POST { state } → use a passed session.
    if (url.pathname === "/pages" && (req.method === "GET" || req.method === "POST")) {
      const body = req.method === "POST" ? await readJson(req) : {};
      if (body === null) return send(res, 400, { ok: false, code: "bad_request", error: "Invalid JSON body." });
      return send(res, 200, { ok: true, pages: await listPages(body?.state) });
    }

    if (req.method === "POST" && url.pathname === "/post") {
      const body = await readJson(req);
      if (!body) return send(res, 400, { ok: false, code: "bad_request", error: "Invalid JSON body." });

      // Optional image: accept a base64 data payload, write to a temp file the
      // browser can attach (avoids the admin app needing shared disk).
      let imagePath;
      if (body.imageBase64) {
        try {
          const dir = await mkdir(path.join(os.tmpdir(), "fb-runner"), { recursive: true });
          const file = path.join(dir || path.join(os.tmpdir(), "fb-runner"), `img-${Date.now()}.jpg`);
          await writeFile(file, Buffer.from(body.imageBase64, "base64"));
          imagePath = file;
        } catch {
          return send(res, 500, { ok: false, code: "media_write_failed", error: "Couldn't stage the image on the runner." });
        }
      }

      const result = await postToPage({
        state: body.state, // optional saved storageState → ephemeral authed context
        pageUrl: body.pageUrl,
        pageName: body.pageName,
        message: body.message,
        imagePath,
      });
      return send(res, 200, { ok: true, ...result });
    }

    return send(res, 404, { ok: false, code: "not_found", error: "Unknown endpoint." });
  } catch (e) {
    const { status, body } = errorResponse(e);
    return send(res, status, body);
  }
});

server.listen(PORT, HOST, () => {
  if (!TOKEN) {
    console.warn("⚠️  FB_RUNNER_TOKEN is not set — all authed endpoints will reject. Set it before use.");
  }
  console.log(`fb-runner listening on http://${HOST}:${PORT}  (health: /health)`);
  console.log("Tip: POST /login, finish login in the window, then GET /pages and POST /post.");
});
