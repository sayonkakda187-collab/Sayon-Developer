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

type Broken = {
  id: string;
  title: string;
  slug: string;
  coverImage: string | null;
  categoryId: string | null;
  /** Why it is broken — the three causes need different explanations, and
   *  "none" is repaired differently (there is nothing to clear). */
  reason: "host" | "missing" | "none";
};

/** A probe is cheap but not free; bound it so a wall of dead URLs cannot eat the
 *  whole request. */
const PROBE_TIMEOUT_MS = 4000;
const PROBE_CONCURRENCY = 8;

/**
 * Is the image DEFINITELY not there any more?
 *
 * Phrased as absence on purpose. The repair deletes covers, so the question it
 * must answer is "am I certain this is gone?", not "did the request succeed?".
 * An earlier version returned `head.ok`, which made a 403, a 429 or a 503 look
 * exactly like a deleted file — so a CDN rate-limiting us mid-repair would have
 * cleared working covers across the site. Only 404 and 410 mean gone; every
 * other answer, and every network error, means leave it alone.
 *
 * A 405/501 means the host refuses HEAD, not that the file is absent, so that
 * falls back to a ranged GET of the first byte.
 */
async function imageMissing(url: string): Promise<boolean> {
  const GONE = new Set([404, 410]);
  const check = async (init: RequestInit) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), PROBE_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: ctl.signal, cache: "no-store", redirect: "follow" });
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    const head = await check({ method: "HEAD" });
    if (head.status === 405 || head.status === 501) {
      const get = await check({ method: "GET", headers: { Range: "bytes=0-0" } });
      return GONE.has(get.status);
    }
    return GONE.has(head.status);
  } catch {
    return false; // timeout or network trouble on our side — never a reason to delete
  }
}

/** Run `fn` over `items` with limited concurrency, stopping at `deadline`.
 *  Items not reached are reported so the caller can say so honestly rather than
 *  silently treating "not checked" as "fine". */
async function mapLimitUntil<T, R>(
  items: T[],
  limit: number,
  deadline: number,
  fn: (item: T) => Promise<R>,
): Promise<{ results: (R | undefined)[]; checked: number }> {
  const results: (R | undefined)[] = new Array(items.length);
  let next = 0;
  let checked = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        if (Date.now() > deadline) return;
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i]);
        checked++;
      }
    }),
  );
  return { results, checked };
}

/** Articles whose stored cover cannot be displayed — wrong host, or the file is
 *  no longer there. */
async function findBroken(
  limit = 500,
  budgetMs = 20_000,
): Promise<{ broken: Broken[]; scanned: number; total: number }> {
  const rows = await prisma.article.findMany({
    where: { coverImage: { not: null } },
    select: { id: true, title: true, slug: true, coverImage: true, categoryId: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Articles with NO cover at all. The query above EXCLUDES them, which is why
  // nothing ever backfilled an article whose automatic image pick came back
  // empty — pickFeaturedImage returns null on any failure, so an outage or an
  // exhausted photo-API key leaves a permanently image-less article that this
  // repair could not even see. They render the first-letter tile in the admin
  // list and the branded card publicly, and stay that way forever.
  const none = await prisma.article.findMany({
    where: { coverImage: null },
    select: { id: true, title: true, slug: true, coverImage: true, categoryId: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const wrongHost = rows.filter((a) => !isRenderableImageUrl(a.coverImage));
  const rightHost = rows.filter((a) => isRenderableImageUrl(a.coverImage));

  // Only allowed-host covers need a network probe; the rest are already known
  // unusable. The scan gets its own budget so the caller keeps time to do the
  // actual repair and return a response — the route's maxDuration is 60s, and a
  // wall of timing-out URLs would otherwise consume all of it.
  const deadline = Date.now() + budgetMs;
  const { results, checked } = await mapLimitUntil(rightHost, PROBE_CONCURRENCY, deadline, (a) =>
    imageMissing(a.coverImage as string),
  );

  return {
    broken: [
      ...wrongHost.map((a) => ({ ...a, reason: "host" as const })),
      // `undefined` means "not reached before the budget ran out" — not broken.
      ...rightHost.filter((_, i) => results[i] === true).map((a) => ({ ...a, reason: "missing" as const })),
      // No probe needed: these have no URL to probe.
      ...none.map((a) => ({ ...a, reason: "none" as const })),
    ],
    scanned: wrongHost.length + checked + none.length,
    total: rows.length + none.length,
  };
}

export async function GET(req: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 302, headers: { location: "/admin/login" } });

  const url = new URL(req.url);
  if (url.searchParams.get("json") === "1") {
    const { broken, scanned, total } = await findBroken();
    return NextResponse.json({
      broken: broken.length,
      scanned,
      total,
      wrongHost: broken.filter((b) => b.reason === "host").length,
      missingFile: broken.filter((b) => b.reason === "missing").length,
      noCover: broken.filter((b) => b.reason === "none").length,
      sample: broken.slice(0, 8).map((a) => ({ title: a.title, cover: a.coverImage, reason: a.reason })),
    });
  }

  const { broken, scanned, total } = await findBroken();
  const wrongHost = broken.filter((b) => b.reason === "host").length;
  const missingFile = broken.filter((b) => b.reason === "missing").length;
  const noCover = broken.filter((b) => b.reason === "none").length;
  const hosts = [...new Set(broken.filter((a) => a.coverImage).map((a) => {
    try { return new URL(a.coverImage as string).hostname; } catch { return "(not a URL)"; }
  }))];
  // Show real stored addresses. Every wrong guess in this investigation came
  // from not being able to see one.
  const samples = broken.filter((a) => a.coverImage).slice(0, 3).map((a) => a.coverImage as string);

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
  <p class="sub" style="margin:0">article${broken.length === 1 ? "" : "s"} needing a cover${
    noCover ? ` &middot; ${noCover} with no cover at all` : ""
  }${
    scanned < total ? ` &middot; checked ${scanned} of ${total} so far` : ""
  }</p>
  ${
    broken.length
      ? `<p class="sub" style="margin:10px 0 0">
           ${missingFile} because the image file is gone &middot;
           ${wrongHost} because the host is not allowed
         </p>
         <p class="sub" style="margin:10px 0 0">Host${hosts.length === 1 ? "" : "s"}: ${hosts
             .map((h) => `<code>${esc(h)}</code>`)
             .join(", ")}</p>
         <pre style="display:block;margin-top:12px">${samples.map((u) => esc(u)).join("\n")}</pre>`
      : '<p class="ok" style="margin-top:14px">Nothing to fix — every cover loads.</p>'
  }
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

  // Split the 60s budget: scan, then repair, then still have time to answer.
  // The scan used to be unbounded and ran BEFORE the repair deadline was even
  // set, so a wall of slow URLs could get the request killed with nothing
  // returned — no progress, no error, nothing to resume from.
  const started = Date.now();
  const { broken, scanned, total } = await findBroken(500, 20_000);
  if (broken.length === 0) {
    return NextResponse.json({ done: scanned >= total, replaced: 0, cleared: 0, stillEmpty: 0, scanned, total });
  }

  const deadline = started + 45_000;
  let replaced = 0;
  let cleared = 0;
  let stillEmpty = 0;

  for (const a of broken) {
    if (Date.now() > deadline) return NextResponse.json({ done: false, replaced, cleared, stillEmpty, scanned, total });

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
    } else if (a.reason === "none") {
      // Nothing to clear — it is already empty. Writing null over null would
      // count a phantom repair and touch updatedAt for no reason. Leave it; a
      // later run can try again once a photo source is reachable.
      stillEmpty++;
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

  // Not done while part of the list went unscanned — the page calls again.
  return NextResponse.json({ done: scanned >= total, replaced, cleared, stillEmpty, scanned, total });
}
