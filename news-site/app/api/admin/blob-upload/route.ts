import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Direct browser → Vercel Blob uploads for LARGE files (gallery videos) that
 * exceed the ~4.5 MB serverless request-body limit of /api/admin/upload. The
 * browser (`@vercel/blob/client` `upload`) asks this route for a short-lived
 * client token, then uploads STRAIGHT to Blob storage — the file never passes
 * through this function, so there's no payload-size ceiling.
 *
 * Admin-gated: `onBeforeGenerateToken` only mints a token for a logged-in admin.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const user = await getSessionUser();
        if (!user) throw new Error("Unauthorized");
        return {
          allowedContentTypes: [
            "video/mp4",
            "video/webm",
            "video/ogg",
            "video/quicktime",
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
          ],
          maximumSizeInBytes: 500 * 1024 * 1024, // 500 MB per file
          addRandomSuffix: true,
        };
      },
      // Vercel calls this server-to-server after the upload finishes; the client
      // already receives the final URL, so there's nothing to persist here.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
