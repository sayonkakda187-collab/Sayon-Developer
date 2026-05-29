import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { getSessionUser } from "@/lib/auth";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported image type." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image is too large (max 5 MB)." },
      { status: 400 },
    );
  }

  const ext = (file.type.split("/")[1] || "bin").replace("jpeg", "jpg");
  const filename = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;

  // Production (and anywhere a Blob store is configured): upload to Vercel Blob.
  // On Vercel's read-only filesystem this is required.
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    const blob = await put(`uploads/${filename}`, file, {
      access: "public",
      token,
      contentType: file.type,
    });
    return NextResponse.json({ url: blob.url });
  }

  // Local-dev fallback: write to ./public/uploads (writable filesystem only).
  const bytes = Buffer.from(await file.arrayBuffer());
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), bytes);
  return NextResponse.json({ url: `/uploads/${filename}` });
}
