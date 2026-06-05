"use server";

import { requireAdmin } from "@/lib/auth";
import { getCountryStats, type CountryStat } from "@/lib/queries";

// Admin-only: visitor-country stats for the Audience dashboard. Returns mapped
// counts only (no IP/PII is ever stored or returned).
export async function getAudienceStats(input: {
  articleId?: string;
  days?: number;
}): Promise<{ stats: CountryStat[]; total: number }> {
  await requireAdmin();
  const days = input.days && input.days > 0 ? Math.min(3650, Math.round(input.days)) : 0;
  const articleId = input.articleId?.trim() || undefined;
  return getCountryStats({ articleId, days });
}
