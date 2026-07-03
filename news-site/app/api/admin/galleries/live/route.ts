import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getLivePresence } from "@/lib/galleryPresence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only: live viewer counts per gallery token (polled by the Galleries tab). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const live = await getLivePresence();
  return NextResponse.json({ live });
}
