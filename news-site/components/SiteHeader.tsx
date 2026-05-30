import { Link } from "next-view-transitions";
import { getCategories, getTrending } from "@/lib/queries";
import { siteConfig } from "@/lib/site";
import { MainNav } from "./MainNav";
import { MobileMenu } from "./MobileMenu";
import { ThemeToggle } from "./ThemeToggle";

export async function SiteHeader() {
  const [categories, trending] = await Promise.all([
    getCategories(),
    getTrending(6),
  ]);
  const navItems = [
    { name: "Home", href: "/" },
    ...categories.map((c) => ({ name: c.name, href: `/category/${c.slug}` })),
  ];

  return (
    <>
      {/* Top utility / trending bar (scrolls away) */}
      {trending.length > 0 && (
        <div className="border-b border-border bg-surface-2/60">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-1.5 sm:px-6 lg:px-8">
            <span className="hidden shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-accent sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              Trending
            </span>
            <div className="flex items-center gap-4 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {trending.map((t) => (
                <Link
                  key={t.slug}
                  href={`/news/${t.slug}`}
                  className="text-xs text-fg-faint transition-colors hover:text-fg"
                >
                  {t.title}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main header (sticky) */}
      <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="font-display text-2xl font-extrabold tracking-tight text-fg"
            >
              {siteConfig.name}
            </Link>
            <MainNav items={navItems} />
          </div>

          <div className="flex items-center gap-1.5">
            <Link
              href="/search"
              aria-label="Search"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </Link>
            <ThemeToggle />
            <MobileMenu items={[...navItems, { name: "Search", href: "/search" }]} />
          </div>
        </div>
      </header>
    </>
  );
}
