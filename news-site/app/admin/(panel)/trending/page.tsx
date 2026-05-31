import { TrendingNews } from "@/components/admin/TrendingNews";
import { TRENDING_CATEGORIES, TRENDING_LANGUAGES, TRENDING_COUNTRIES } from "@/lib/gnews";

// Live feed + env-dependent; never statically cache this screen.
export const dynamic = "force-dynamic";

export default function AdminTrendingPage() {
  // Pass only plain data to the client. `configured` lets the UI prompt for the
  // key (without spending an API request) when GNEWS_API_KEY isn't set — the key
  // itself is never serialized to the browser.
  const categories = TRENDING_CATEGORIES.map((c) => ({ id: c.id, label: c.label }));
  const languages = TRENDING_LANGUAGES.map((l) => ({ id: l.id, label: l.label }));
  const countries = TRENDING_COUNTRIES.map((c) => ({ id: c.id, label: c.label }));
  const configured = Boolean(process.env.GNEWS_API_KEY);
  return (
    <TrendingNews
      categories={categories}
      languages={languages}
      countries={countries}
      configured={configured}
    />
  );
}
