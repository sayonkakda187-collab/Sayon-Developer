import Link from "next/link";
import { getCategories } from "@/lib/queries";
import { siteConfig } from "@/lib/site";
import { NewsletterForm } from "./NewsletterForm";

export async function SiteFooter() {
  const categories = await getCategories();

  return (
    <footer className="mt-20 border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-12 md:grid-cols-[1.5fr_1fr_1.5fr]">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-fg">
              {siteConfig.name}
            </h2>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-fg-muted">
              {siteConfig.description}
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-fg-faint">
              Sections
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link
                  href="/"
                  className="text-fg-muted transition-colors hover:text-accent-link"
                >
                  Home
                </Link>
              </li>
              {categories.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/category/${c.slug}`}
                    className="text-fg-muted transition-colors hover:text-accent-link"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-fg-faint">
              Newsletter
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-fg-muted">
              The day&apos;s biggest stories, delivered to your inbox.
            </p>
            <NewsletterForm />
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-6 text-xs text-fg-faint">
          © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
