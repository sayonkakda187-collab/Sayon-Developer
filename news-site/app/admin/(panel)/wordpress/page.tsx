import { ToastProvider } from "@/components/admin/Toast";
import { WordPressManager } from "@/components/admin/WordPressManager";
import { wordpressStatus } from "@/lib/wordpress/client";

export const dynamic = "force-dynamic";

/**
 * Only the CONFIGURATION status is resolved here — it reads env vars and makes
 * no network call. Posts and taxonomies are fetched from the browser, so an
 * unreachable WordPress site shows as an error inside the panel rather than
 * stalling this page's render.
 */
export default async function AdminWordPressPage() {
  const status = wordpressStatus();
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
        <WordPressManager status={status} />
      </ToastProvider>
    </div>
  );
}
