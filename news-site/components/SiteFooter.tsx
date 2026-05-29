import Link from "next/link";
import { getCategories } from "@/lib/queries";
import { siteConfig } from "@/lib/site";
import { NewsletterForm } from "./NewsletterForm";

export async function SiteFooter() {
  const categories = await getCategories();

  return (
    <footer className="mt-16 border-t border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <h2 className="font-serif text-xl font-extrabold text-gray-900">
              {siteConfig.name}
            </h2>
            <p className="mt-2 max-w-xs text-sm text-gray-600">
              {siteConfig.description}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              Sections
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/" className="text-gray-700 hover:text-red-700">
                  Home
                </Link>
              </li>
              {categories.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/category/${c.slug}`}
                    className="text-gray-700 hover:text-red-700"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              Newsletter
            </h3>
            <p className="mt-3 text-sm text-gray-600">
              Get the day&apos;s top stories delivered to your inbox.
            </p>
            <NewsletterForm />
          </div>
        </div>

        <div className="mt-10 border-t border-gray-200 pt-6 text-xs text-gray-400">
          © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
