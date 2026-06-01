import { TrendingNews } from "@/components/admin/TrendingNews";
import { TRENDING_CATEGORIES, TRENDING_LANGUAGES, TRENDING_COUNTRIES } from "@/lib/gnews";
import { isAiConfigured } from "@/lib/aiAssist";
import { NEWS_SOURCES } from "@/lib/news/sources";
import { sourceConfigMap } from "@/lib/news/aggregate";

// Live feed + env-dependent; never statically cache this screen.
export const dynamic = "force-dynamic";

export default function AdminTrendingPage() {
  // Pass only plain data to the client. The configured map flags which news
  // sources have a key set — without spending a request and without ever
  // serializing a key to the browser.
  const categories = TRENDING_CATEGORIES.map((c) => ({ id: c.id, label: c.label }));
  const languages = TRENDING_LANGUAGES.map((l) => ({ id: l.id, label: l.label }));
  const countries = TRENDING_COUNTRIES.map((c) => ({ id: c.id, label: c.label }));

  const configuredMap = sourceConfigMap();
  const sources = NEWS_SOURCES.map((s) => ({
    id: s.id,
    label: s.label,
    site: s.site,
    freeNote: s.freeNote,
    configured: configuredMap[s.id],
  }));
  const anyConfigured = sources.some((s) => s.configured);

  return (
    <TrendingNews
      categories={categories}
      languages={languages}
      countries={countries}
      sources={sources}
      configured={anyConfigured}
      aiConfigured={isAiConfigured()}
    />
  );
}
