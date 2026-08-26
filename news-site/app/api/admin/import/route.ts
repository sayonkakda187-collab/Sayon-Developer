import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  importFromDatabase,
  compareDatabases,
  type ImportGroup,
} from "@/lib/importFromDatabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Move content from the old database into this one.
 *
 * Gated on the real admin SESSION, not on BOOTSTRAP_SECRET — that secret exists
 * only to create the first account and should be deleted once it has. This
 * endpoint accepts another database's connection string, so it must sit behind
 * the strongest gate the site has.
 *
 * `getSessionUser` rather than `requireAdmin`: the latter redirects to the login
 * page, which turns a 401 into an HTML page a fetch() cannot make sense of.
 */
async function denied(): Promise<NextResponse | null> {
  const user = await getSessionUser();
  if (user) return null;
  return NextResponse.json({ error: "Sign in to /admin first." }, { status: 401 });
}

const VALID: ImportGroup[] = ["content", "analytics", "integrations"];

export async function POST(req: Request): Promise<NextResponse> {
  const no = await denied();
  if (no) return no;

  const body = (await req.json().catch(() => ({}))) as {
    sourceUrl?: unknown;
    groups?: unknown;
    dryRun?: unknown;
  };

  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : "";
  if (!/^postgres(ql)?:\/\//.test(sourceUrl)) {
    return NextResponse.json(
      { error: "Paste the old database's connection string — it starts with postgresql://" },
      { status: 400 },
    );
  }

  // Compare first so the operator can see what is there before moving anything.
  if (body.dryRun) {
    const cmp = await compareDatabases(sourceUrl);
    return NextResponse.json(cmp, { status: cmp.ok ? 200 : 502 });
  }

  const groups = Array.isArray(body.groups)
    ? (body.groups.filter((g): g is ImportGroup => VALID.includes(g as ImportGroup)))
    : (["content"] as ImportGroup[]);
  if (groups.length === 0) {
    return NextResponse.json({ error: "Choose at least one thing to move." }, { status: 400 });
  }

  // Finish inside maxDuration with room to serialize the response, so a long
  // import reports partial progress instead of being killed mid-flight.
  const result = await importFromDatabase({ sourceUrl, groups, budgetMs: 45_000 });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

/** The page itself. Same session gate. */
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return new Response(null, { status: 302, headers: { location: "/admin/login" } });
  }

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<link rel="icon" href="data:,">
<title>Import old articles</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px 16px 64px; font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
         background:#0f1115; color:#e8e9ed; }
  main { max-width:680px; margin:0 auto; }
  h1 { font-size:22px; margin:0 0 4px; }
  p.sub { margin:0 0 24px; color:#9aa0ad; font-size:14px; }
  .card { background:#171a21; border:1px solid #262b36; border-radius:14px; padding:18px; margin:0 0 16px; }
  label { display:block; font-size:13px; color:#9aa0ad; margin:0 0 6px; }
  input[type=text] { width:100%; padding:12px; font-size:15px; border-radius:10px;
          border:1px solid #2f3542; background:#0f1115; color:#e8e9ed; }
  .row { display:flex; align-items:flex-start; gap:10px; margin:0 0 12px; }
  .row input { margin-top:3px; }
  .row div { flex:1; }
  .row b { display:block; font-size:14px; }
  .row span { font-size:13px; color:#9aa0ad; }
  button { width:100%; padding:14px; font-size:16px; font-weight:600; border:0; border-radius:10px;
           background:#3b82f6; color:#fff; cursor:pointer; margin-top:8px; }
  button.ghost { background:#2a2f3a; color:#e8e9ed; }
  button:disabled { background:#2a2f3a; color:#6b7280; cursor:not-allowed; }
  pre { white-space:pre-wrap; word-break:break-word; background:#0f1115; border:1px solid #262b36;
        border-radius:10px; padding:12px; font-size:13px; margin:14px 0 0; display:none; }
  table { width:100%; border-collapse:collapse; font-size:14px; margin-top:8px; }
  th,td { text-align:left; padding:6px 8px; border-bottom:1px solid #262b36; }
  th { color:#9aa0ad; font-weight:600; font-size:12px; }
  td.n { text-align:right; font-variant-numeric:tabular-nums; }
  .warn { font-size:13px; color:#e2b65a; margin-top:10px; }
</style></head><body><main>

<h1>Import old articles</h1>
<p class="sub">Copies content from the previous database into this one. Safe to run more than once — anything already here is skipped.</p>

<div class="card">
  <label for="url">Old database connection string</label>
  <input id="url" type="text" spellcheck="false" autocapitalize="off" autocomplete="off"
         placeholder="postgresql://user:password@host/dbname?sslmode=require">
  <p class="warn">Get this from the Neon dashboard → your old project → Connection string. It is a password — this page never stores it.</p>
</div>

<div class="card">
  <div class="row">
    <input type="checkbox" id="g-content" checked>
    <div><b>Articles and everything to render them</b>
    <span>Stories, categories, tags, comments, newsletter signups.</span></div>
  </div>
  <div class="row">
    <input type="checkbox" id="g-analytics" checked>
    <div><b>Read history</b>
    <span>View counts per day, country and device — what the Audience tab shows.</span></div>
  </div>
  <div class="row">
    <input type="checkbox" id="g-integrations">
    <div><b>Connected accounts</b>
    <span>Facebook Pages, managers, saved settings. Their tokens are encrypted with
    ENCRYPTION_KEY — if that changed too, these rows arrive unreadable and each
    Page has to be reconnected. Leave off unless you know it is the same.</span></div>
  </div>
  <button class="ghost" id="check">Check what is there first</button>
  <button id="go">Move it across</button>
  <pre id="out"></pre>
</div>

<script>
(function () {
  var out = document.getElementById("out");
  function show(t) { out.style.display = "block"; out.textContent = t; }
  function url() { return document.getElementById("url").value.trim(); }
  function groups() {
    return ["content","analytics","integrations"].filter(function (g) {
      return document.getElementById("g-" + g).checked;
    });
  }
  async function post(payload) {
    var res = await fetch("/api/admin/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    var text = await res.text();
    try { return { ok: res.ok, data: JSON.parse(text) }; }
    catch (e) { return { ok: res.ok, data: { raw: text.slice(0, 400) } }; }
  }

  document.getElementById("check").onclick = async function () {
    if (!url()) { show("Paste the old connection string first."); return; }
    show("Checking…");
    var r = await post({ sourceUrl: url(), dryRun: true });
    if (!r.ok) { show(r.data.error || JSON.stringify(r.data)); return; }
    var lines = r.data.rows.map(function (x) {
      return "  " + x.table.padEnd(24) + String(x.source).padStart(7) + " old" +
             String(x.target).padStart(8) + " here";
    });
    show(lines.length ? "table                      old      here\\n" + lines.join("\\n")
                      : "Connected, but the old database looks empty.");
  };

  document.getElementById("go").onclick = async function () {
    var btn = this;
    if (!url()) { show("Paste the old connection string first."); return; }
    if (!groups().length) { show("Tick at least one thing to move."); return; }
    btn.disabled = true;
    var totals = {}, skips = {}, pass = 0;
    try {
      // The import stops before the request times out and reports done:false.
      // Keep calling until it finishes — already-copied rows are skipped.
      for (;;) {
        pass++;
        show("Moving… (pass " + pass + ")");
        var r = await post({ sourceUrl: url(), groups: groups() });
        if (!r.ok) { show("Failed: " + (r.data.error || JSON.stringify(r.data))); break; }
        (r.data.tables || []).forEach(function (t) {
          totals[t.table] = (totals[t.table] || 0) + t.copied;
          skips[t.table] = (skips[t.table] || 0) + t.skipped;
        });
        if (r.data.done) {
          var lines = Object.keys(totals).filter(function (k) { return totals[k] > 0; })
            .map(function (k) { return "  " + k.padEnd(24) + String(totals[k]).padStart(7); });
          var alreadyHere = Object.keys(skips).reduce(function (n, k) { return n + skips[k]; }, 0);
          show("Done.\\n\\n" +
               (lines.length ? "copied\\n" + lines.join("\\n") + "\\n"
                             : "Nothing new to copy.\\n") +
               (alreadyHere ? "\\n" + alreadyHere + " row(s) were already here and were left alone.\\n" : "") +
               "\\nOpen /admin to see them.");
          break;
        }
        if (pass > 40) { show("Stopped after 40 passes — tap again to continue."); break; }
      }
    } catch (e) {
      show("Request failed: " + e.message + "\\n\\nTap again — copied rows are skipped, so it resumes.");
    }
    btn.disabled = false;
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
