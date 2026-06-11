"use server";

import { getCategoryArticlesRange, toCardArticle, type CardArticle } from "@/lib/queries";

// Public action powering the category "Load more" button: returns the next slice
// of published articles (serializable) + the total. Reads published content only.
export async function loadMoreCategory(input: {
  categoryId: string;
  skip: number;
}): Promise<{ items: CardArticle[]; total: number }> {
  const categoryId = String(input?.categoryId ?? "");
  const skip = Math.max(0, Number(input?.skip ?? 0) || 0);
  if (!categoryId) return { items: [], total: 0 };
  const { articles, total } = await getCategoryArticlesRange(categoryId, skip, 12);
  return { items: articles.map(toCardArticle), total };
}
