import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const b = body as {
    articleId?: unknown;
    authorName?: unknown;
    content?: unknown;
  };
  const articleId = String(b?.articleId ?? "").trim();
  const authorName = String(b?.authorName ?? "").trim();
  const content = String(b?.content ?? "").trim();

  if (!articleId || !authorName || !content) {
    return NextResponse.json(
      { error: "Name and comment are both required." },
      { status: 400 },
    );
  }
  if (authorName.length > 80) {
    return NextResponse.json({ error: "Name is too long." }, { status: 400 });
  }
  if (content.length > 5000) {
    return NextResponse.json(
      { error: "Comment is too long (5000 characters max)." },
      { status: 400 },
    );
  }

  const article = await prisma.article.findFirst({
    where: { id: articleId, status: "published" },
    select: { id: true },
  });
  if (!article) {
    return NextResponse.json({ error: "Article not found." }, { status: 404 });
  }

  // Stored unapproved; an admin must approve before it appears publicly.
  await prisma.comment.create({
    data: { articleId, authorName, content, approved: false },
  });

  return NextResponse.json({
    message: "Thanks! Your comment is awaiting moderation.",
  });
}
