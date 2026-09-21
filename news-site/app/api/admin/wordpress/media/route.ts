import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { uploadMedia } from "@/lib/wordpress/client";

/**
 * Uploads an image to the WordPress media library, for use as a post's featured
 * image.
 *
 * A ROUTE rather than a server action, deliberately: server actions carry a
 * small default body limit and are awkward for binary payloads, and this
 * project already uploads images through a route (`/api/admin/upload`). Unlike
 * that one, the bytes go to WORDPRESS, not Vercel Blob — `featured_media` needs
 * a WordPress attachment id, which only WordPress can mint.
 *
 * Auth matches the other admin routes: `getSessionUser()` directly, since
 * `requireAdmin()` is written for server components.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

// Vercel rejects a serverless request body over ~4.5 MB before it reaches this
// handler, so anything larger would fail as an opaque platform error. The
// browser downscales first; this is the backstop with a message that explains
// itself.
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let file: unknown;
  try {
    const form = await req.formData();
    file = form.get("file");
  } catch {
    return NextResponse.json({ ok: false, error: "Could not read the upload." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "No image was provided." }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { ok: false, error: `Unsupported image type (${file.type || "unknown"}). Use JPEG, PNG, WebP, GIF or AVIF.` },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ ok: false, error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: `Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). The limit is 4 MB.` },
      { status: 413 },
    );
  }

  const result = await uploadMedia({
    data: await file.arrayBuffer(),
    filename: file.name || "upload",
    contentType: file.type,
  });

  if (!result.ok) {
    // Map the WordPress failure kind onto a sensible HTTP status for the client.
    const status =
      result.kind === "unauthorized" ? 401
      : result.kind === "forbidden" ? 403
      : result.kind === "not_configured" ? 503
      : result.kind === "network" ? 504
      : 400;
    return NextResponse.json({ ok: false, error: result.message }, { status });
  }

  return NextResponse.json({ ok: true, media: result.data });
}
