import Link from "next/link";
import { getCategories } from "@/lib/queries";
import { siteConfig } from "@/lib/site";
import { SearchForm } from "./SearchForm";
import { MobileMenu } from "./MobileMenu";
import { ThemeToggle } from "./ThemeToggle";

export async function SiteHeader() {
  const categories = await getCategories();
  const navItems = [
    { name: "Home", href: "/" },
    ...categories.map((c) => ({ name: c.name, href: `/category/${c.slug}` })),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="font-display text-2xl font-bold tracking-tight text-fg"
        >
          {siteConfig.name}
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-fg-muted transition-colors hover:text-fg"
            >
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden w-56 lg:block">
            <SearchForm />
          </div>
          <ThemeToggle />
          <MobileMenu items={[...navItems, { name: "Search", href: "/search" }]} />
        </div>
      </div>
    </header>
  );
}
