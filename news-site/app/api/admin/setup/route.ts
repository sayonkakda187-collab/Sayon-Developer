import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { MIGRATIONS } from "@/lib/generated/migrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A setup page you can actually reach from a phone.
 *
 * /api/admin/migrate and /api/admin/bootstrap both need a POST, and a browser
 * address bar only issues GET — which left "run this curl command" as the only
 * way to use them. On a locked-out site that is the wrong last mile. This serves
 * a small HTML page, behind the same secret, whose buttons make those two POSTs.
 *
 * It renders nothing but the status of the database; no credentials are ever
 * echoed back, and the page is noindex + no-store.
 */
function secretOk(given: string | null): boolean {
  const expected = process.env.BOOTSTRAP_SECRET ?? "";
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (!secretOk(secret)) {
    return new Response("Not found.", { status: 404 });
  }

  // Report the real state rather than assuming it: an empty database and an
  // unreachable one need completely different actions from the reader.
  let status: { reachable: boolean; tables: number; users: number | null; error: string | null };
  try {
    const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*)::bigint AS count FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tables = Number(rows[0]?.count ?? 0);
    let users: number | null = null;
    try {
      users = await prisma.user.count();
    } catch {
      users = null; // tables not created yet — expected before step 1
    }
    status = { reachable: true, tables, users, error: null };
  } catch (e) {
    status = {
      reachable: false,
      tables: 0,
      users: null,
      error: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
    };
  }

  // Embedded inside a <script>; JSON alone would let a "</script>" in the value
  // break out of the tag, so escape the characters that can close it.
  const secretJs = JSON.stringify(secret).replace(/</g, "\\u003c");
  const step1Done = status.tables > 0;
  const step2Done = (status.users ?? 0) > 0;

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Site setup</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px 16px 64px; font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
         background:#0f1115; color:#e8e9ed; }
  main { max-width:640px; margin:0 auto; }
  h1 { font-size:22px; margin:0 0 4px; }
  p.sub { margin:0 0 24px; color:#9aa0ad; font-size:14px; }
  .card { background:#171a21; border:1px solid #262b36; border-radius:14px; padding:18px; margin:0 0 16px; }
  .card h2 { font-size:16px; margin:0 0 4px; display:flex; align-items:center; gap:8px; }
  .card p { margin:0 0 14px; color:#9aa0ad; font-size:14px; }
  .pill { font-size:12px; font-weight:600; padding:2px 9px; border-radius:999px; }
  .ok   { background:#0d3320; color:#5fd996; }
  .todo { background:#33290d; color:#e2b65a; }
  .bad  { background:#3a1618; color:#f08a8a; }
  label { display:block; font-size:13px; color:#9aa0ad; margin:0 0 6px; }
  input { width:100%; padding:12px; margin:0 0 12px; font-size:16px; border-radius:10px;
          border:1px solid #2f3542; background:#0f1115; color:#e8e9ed; }
  button { width:100%; padding:14px; font-size:16px; font-weight:600; border:0; border-radius:10px;
           background:#3b82f6; color:#fff; cursor:pointer; }
  button:disabled { background:#2a2f3a; color:#6b7280; cursor:not-allowed; }
  pre { white-space:pre-wrap; word-break:break-word; background:#0f1115; border:1px solid #262b36;
        border-radius:10px; padding:12px; font-size:13px; margin:14px 0 0; display:none; }
  a { color:#6aa8ff; }
  .note { font-size:13px; color:#9aa0ad; border-top:1px solid #262b36; padding-top:14px; margin-top:8px; }
</style></head><body><main>

<h1>Site setup</h1>
<p class="sub">${
    status.reachable
      ? `Database reachable · ${status.tables} table${status.tables === 1 ? "" : "s"}${
          status.users === null ? "" : ` · ${status.users} account${status.users === 1 ? "" : "s"}`
        }`
      : "Database unreachable"
  }</p>

${
  status.reachable
    ? ""
    : `<div class="card"><h2>Can’t reach the database <span class="pill bad">error</span></h2>
       <p>Fix <code>DATABASE_URL</code> before running the steps below.</p>
       <pre style="display:block">${esc(status.error ?? "")}</pre></div>`
}

<div class="card">
  <h2>1. Create the tables <span class="pill ${step1Done ? "ok" : "todo"}">${step1Done ? "done" : "to do"}</span></h2>
  <p>Applies all ${MIGRATIONS.length} database migrations. Safe to run more than once — anything already applied is skipped.</p>
  <button id="b1" ${status.reachable ? "" : "disabled"}>${step1Done ? "Run again" : "Create the tables"}</button>
  <pre id="o1"></pre>
</div>

<div class="card">
  <h2>2. Create the admin account <span class="pill ${step2Done ? "ok" : "todo"}">${step2Done ? "done" : "to do"}</span></h2>
  ${
    step2Done
      ? `<p>An account already exists, so this step is closed. <a href="/admin/login">Go to the login page</a>.</p>`
      : `<p>Choose the email and password you’ll sign in with. The password must be at least 8 characters.</p>
         <label for="em">Email</label>
         <input id="em" type="email" autocomplete="username" placeholder="you@example.com">
         <label for="pw">Password</label>
         <input id="pw" type="password" autocomplete="new-password" placeholder="at least 8 characters">
         <button id="b2" ${step1Done ? "" : "disabled"}>${step1Done ? "Create the account" : "Do step 1 first"}</button>`
  }
  <pre id="o2"></pre>
</div>

<p class="note">When both steps say <strong>done</strong>, delete the <code>BOOTSTRAP_SECRET</code> variable from your hosting environment — this page and both endpoints stop working without it.</p>

<script>
(function () {
  var SECRET = ${secretJs};
  function show(el, text) { el.style.display = "block"; el.textContent = text; }

  async function post(path, body) {
    var res = await fetch(path + "?secret=" + encodeURIComponent(SECRET), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {})
    });
    var text = await res.text();
    var data;
    try { data = JSON.parse(text); } catch (e) { data = { raw: text.slice(0, 500) }; }
    return { ok: res.ok, status: res.status, data: data };
  }

  var b1 = document.getElementById("b1");
  if (b1) b1.onclick = async function () {
    b1.disabled = true; var label = b1.textContent; b1.textContent = "Working…";
    var o1 = document.getElementById("o1");
    try {
      var r = await post("/api/admin/migrate");
      if (r.ok) {
        show(o1, "Applied " + r.data.applied + ", skipped " + r.data.skipped + ". " + r.data.tables + " tables now exist.");
        setTimeout(function () { location.reload(); }, 1200);
        return;
      }
      show(o1, "Failed on: " + (r.data.failedOn || "unknown") + "\\n\\n" + (r.data.error || JSON.stringify(r.data)));
    } catch (e) {
      // A timeout mid-run is survivable: the migrations that committed stay
      // committed, and the endpoint skips them next time. Say so, rather than
      // leaving a bare network error that reads like a dead end.
      show(o1, "Request failed: " + e.message + "\n\nTap again — anything already applied is skipped, so it picks up where it stopped.");
    }
    b1.disabled = false; b1.textContent = label;
  };

  var b2 = document.getElementById("b2");
  if (b2) b2.onclick = async function () {
    var o2 = document.getElementById("o2");
    var email = document.getElementById("em").value.trim();
    var password = document.getElementById("pw").value;
    if (!email || password.length < 8) {
      show(o2, "Enter an email and a password of at least 8 characters.");
      return;
    }
    b2.disabled = true; var label = b2.textContent; b2.textContent = "Working…";
    try {
      var r = await post("/api/admin/bootstrap", { email: email, password: password });
      if (r.ok) {
        show(o2, "Account created for " + r.data.email + ". Opening the login page…");
        setTimeout(function () { location.href = "/admin/login"; }, 1200);
        return;
      }
      show(o2, r.data.error || JSON.stringify(r.data));
    } catch (e) {
      show(o2, "Request failed: " + e.message);
    }
    b2.disabled = false; b2.textContent = label;
  };
})();
</script>
</main></body></html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
