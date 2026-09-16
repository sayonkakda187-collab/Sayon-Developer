import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isRenderableImageUrl } from "@/lib/imageHosts.mjs";
import { pickFeaturedImage } from "@/lib/imageSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Repair articles whose cover image can never be displayed.
 *
 * Covers were once saved pointing at pixabay.com — a host next/image refuses,
 * because Pixabay forbids hotlinking and we copy its images to Blob instead.
 * Those articles show an empty box with alt text and will do so forever; the
 * fix that stopped NEW ones being saved does nothing for the ones already
 * stored.
 *
 * For each broken cover: look for a replacement image, and if none can be had,
 * CLEAR it. A cleared cover falls back to the branded OG card, which looks
 * deliberate — an empty box never does. Clearing is the floor, so this always
 * ends the visible breakage even when no image source is reachable.
 *
 * Gated on the admin session. Idempotent: an article with a renderable cover is
 * skipped, so re-running costs nothing and a timed-out run can be resumed.
 */
async function denied(): Promise<NextResponse | null> {
  const user = await getSessionUser();
  return user ? null : NextResponse.json({ error: "Sign in to /admin first." }, { status: 401 });
}

type Broken = { id: string; title: string; slug: string; coverImage: string | null; categoryId: string | null };

/** Articles whose stored cover cannot be rendered. Filtered in JS because the
 *  test is a URL-shape question the database cannot express. */
async function findBroken(limit = 500): Promise<Broken[]> {
  const rows = await prisma.article.findMany({
    where: { coverImage: { not: null } },
    select: { id: true, title: true, slug: true, coverImage: true, categoryId: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.filter((a) => !isRenderableImageUrl(a.coverImage));
}

export async function GET(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 302, headers: { location: "/admin/login" } });

  const url = new URL(req.url);
  if (url.searchParams.get("json") === "1") {
    const broken = await findBroken();
    return NextResponse.json({
      broken: broken.length,
      sample: broken.slice(0, 5).map((a) => ({ title: a.title, cover: a.coverImage })),
    });
  }

  const broken = await findBroken();
  const hosts = [...new Set(broken.map((a) => {
    try { return new URL(a.coverImage!).hostname; } catch { return "(not a URL)"; }
  }))];

  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><link rel="icon" href="data:,">
<title>Fix broken cover images</title>
<style>
  :root { color-scheme: light dark; } * { box-sizing: border-box; }
  body { margin:0; padding:24px 16px 64px; font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:#0f1115; color:#e8e9ed; }
  main { max-width:640px; margin:0 auto; }
  h1 { font-size:22px; margin:0 0 4px; } p.sub { margin:0 0 24px; color:#9aa0ad; font-size:14px; }
  .card { background:#171a21; border:1px solid #262b36; border-radius:14px; padding:18px; margin:0 0 16px; }
  .big { font-size:34px; font-weight:700; margin:0 0 4px; }
  button { width:100%; padding:14px; font-size:16px; font-weight:600; border:0; border-radius:10px; background:#3b82f6; color:#fff; cursor:pointer; margin-top:8px; }
  button:disabled { background:#2a2f3a; color:#6b7280; cursor:not-allowed; }
  pre { white-space:pre-wrap; word-break:break-word; background:#0f1115; border:1px solid #262b36; border-radius:10px; padding:12px; font-size:13px; margin:14px 0 0; display:none; }
  code { color:#e2b65a; } .ok { color:#5fd996; }
</style></head><body><main>
<h1>Fix broken cover images</h1>
<p class="sub">Finds articles whose cover image can never load, and repairs them.</p>

<div class="card">
  <p class="big">${broken.length}</p>
  <p class="sub" style="margin:0">article${broken.length === 1 ? "" : "s"} with an unusable cover${
    hosts.length ? ` &middot; from: ${hosts.map((h) => `<code>${esc(h)}</code>`).join(", ")}` : ""
  }</p>
  ${broken.length === 0 ? '<p class="ok" style="margin-top:14px">Nothing to fix — every cover can be displayed.</p>' : ""}
</div>

${broken.length ? `<div class="card">
  <p style="margin:0 0 12px">For each one I'll look for a replacement image. If none can be found, the cover is cleared so your branded card shows instead of an empty box.</p>
  <p class="sub" style="margin:0">Safe to run more than once. It only touches covers that cannot load — working images are left alone.</p>
  <button id="go">Repair ${broken.length} article${broken.length === 1 ? "" : "s"}</button>
  <pre id="out"></pre>
</div>` : ""}

<script>
(function () {
  var btn = document.getElementById("go"); if (!btn) return;
  var out = document.getElementById("out");
  function show(t) { out.style.display = "block"; out.textContent = t; }
  btn.onclick = async function () {
    btn.disabled = true;
    var replaced = 0, cleared = 0, pass = 0;
    try {
      for (;;) {
        pass++;
        show("Repairing… (pass " + pass + ")");
        var res = await fetch("/api/admin/fix-covers", { method: "POST" });
        var d = await res.json().catch(function () { return {}; });
        if (!res.ok) { show("Failed: " + (d.error || JSON.stringify(d))); break; }
        replaced += d.replaced || 0; cleared += d.cleared || 0;
        if (d.done) {
          show("Done.\\n\\n" + replaced + " given a new image\\n" + cleared +
               " cleared (branded card will show)\\n\\nReload your site to see them.");
          setTimeout(function () { location.reload(); }, 2500);
          break;
        }
        if (pass > 40) { show("Stopped after 40 passes — press again to continue."); break; }
      }
    } catch (e) {
      show("Request failed: " + e.message + "\\n\\nPress again — finished articles are skipped, so it resumes.");
    }
    btn.disabled = false;
  };
})();
</script>
</main></body></html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
  });
}

export async function POST(): Promise<NextResponse> {
  const no = await denied();
  if (no) return no;

  const broken = await findBroken();
  if (broken.length === 0) return NextResponse.json({ done: true, replaced: 0, cleared: 0 });

  // Leave room to serialize the response inside maxDuration; the page calls
  // again until done, and repaired articles drop out of findBroken().
  const deadline = Date.now() + 45_000;
  let replaced = 0;
  let cleared = 0;

  for (const a of broken) {
    if (Date.now() > deadline) return NextResponse.json({ done: false, replaced, cleared });

    let category: string | undefined;
    if (a.categoryId) {
      const c = await prisma.category.findUnique({ where: { id: a.categoryId }, select: { name: true } });
      category = c?.name;
    }

    const found = await pickFeaturedImage(a.title, category).catch(() => null);
    if (found && isRenderableImageUrl(found.url)) {
      await prisma.article.update({
        where: { id: a.id },
        data: {
          coverImage: found.url,
          coverCredit: found.credit || null,
          coverCreditUrl: found.creditUrl || null,
          coverImageSource: found.source || null,
        },
      });
      replaced++;
    } else {
      // The floor: an article with no cover renders the branded OG card, which
      // is a deliberate-looking design. An unusable URL renders an empty box
      // forever. Clearing is always an improvement.
      await prisma.article.update({
        where: { id: a.id },
        data: { coverImage: null, coverCredit: null, coverCreditUrl: null, coverImageSource: null },
      });
      cleared++;
    }
  }

  return NextResponse.json({ done: true, replaced, cleared });
}
