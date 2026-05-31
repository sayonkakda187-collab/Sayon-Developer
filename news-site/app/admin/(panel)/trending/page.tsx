import { prisma } from "@/lib/db";
import { TrendingNews } from "@/components/admin/TrendingNews";
import { ToastProvider } from "@/components/admin/Toast";
import { TRENDING_CATEGORIES, TRENDING_LANGUAGES, TRENDING_COUNTRIES } from "@/lib/gnews";
import { isAiConfigured } from "@/lib/aiAssist";
import { listSavedIdeas, listFollowedTopics } from "@/app/admin/trending-actions";

// Live feed + env-dependent; never statically cache this screen.
export const dynamic = "force-dynamic";

export default async function AdminTrendingPage() {
  // Plain data only. `configured` flags let the UI prompt for setup without
  // spending an API request or leaking either key to the browser.
  const categories = TRENDING_CATEGORIES.map((c) => ({ id: c.id, label: c.label }));
  const languages = TRENDING_LANGUAGES.map((l) => ({ id: l.id, label: l.label }));
  const countries = TRENDING_COUNTRIES.map((c) => ({ id: c.id, label: c.label }));
  const configured = Boolean(process.env.GNEWS_API_KEY);

  // For the "Already covered" indicator: a lightweight title list (no bodies).
  // Matching runs client-side, so no extra GNews calls. Saved ideas + followed
  // topics are scoped per-admin inside the actions (requireAdmin).
  const [titleRows, saved, topics] = await Promise.all([
    prisma.article.findMany({ select: { title: true }, take: 1000 }),
    listSavedIdeas(),
    listFollowedTopics(),
  ]);

  return (
    <ToastProvider>
      <TrendingNews
        categories={categories}
        languages={languages}
        countries={countries}
        configured={configured}
        aiConfigured={isAiConfigured()}
        existingTitles={titleRows.map((t) => t.title)}
        initialSaved={saved}
        initialTopics={topics}
      />
    </ToastProvider>
  );
}
