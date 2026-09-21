import { ToastProvider } from "@/components/admin/Toast";
import { WordPressManager } from "@/components/admin/WordPressManager";
import { wordpressStatus } from "@/lib/wordpress/client";
import { isAiConfigured } from "@/lib/aiAssist";
import { sourceConfigMap } from "@/lib/news/aggregate";
import { NEWS_SOURCES } from "@/lib/news/sources";
import { TRENDING_CATEGORIES } from "@/lib/gnews";

export const dynamic = "force-dynamic";

/**
 * Only the CONFIGURATION status is resolved here — it reads env vars and makes
 * no network call. Posts and taxonomies are fetched from the browser, so an
 * unreachable WordPress site shows as an error inside the panel rather than
 * stalling this page's render.
 */
export default async function AdminWordPressPage() {
  const status = wordpressStatus();

  // Plain data only. These are env checks, not network calls — and no key value
  // is ever serialized to the browser, only whether one is present.
  const configured = sourceConfigMap();
  const compose = {
    aiConfigured: isAiConfigured(),
    newsConfigured: NEWS_SOURCES.some((s) => configured[s.id]),
  };
  const categories = TRENDING_CATEGORIES.map((c) => ({ id: c.id, label: c.label }));

  return (
    <div>
      <div className="adm-page-h">
        <h1>WordPress</h1>
        <p>
          Publish and manage posts on your external WordPress site over its REST API.
          Credentials stay on the server.
        </p>
      </div>
      <ToastProvider>
        <WordPressManager status={status} compose={compose} trendingCategories={categories} />
      </ToastProvider>
    </div>
  );
}
