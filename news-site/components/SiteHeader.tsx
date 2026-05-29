import Link from "next/link";
import { getCategories } from "@/lib/queries";
import { siteConfig } from "@/lib/site";
import { SearchForm } from "./SearchForm";
import { MobileMenu } from "./MobileMenu";

export async function SiteHeader() {
  const categories = await getCategories();
  const navItems = [
    { name: "Home", href: "/" },
    ...categories.map((c) => ({ name: c.name, href: `/category/${c.slug}` })),
  ];

  return (
    <header className="relative border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="font-serif text-2xl font-extrabold tracking-tight text-gray-900"
        >
          {siteConfig.name}
        </Link>

        <div className="hidden w-full max-w-xs md:block">
          <SearchForm />
        </div>

        <MobileMenu items={[...navItems, { name: "Search", href: "/search" }]} />
      </div>

      {/* Category navigation (desktop) */}
      <nav className="hidden border-t border-gray-100 md:block">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-1 px-4 py-2 text-sm font-medium sm:px-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-gray-700 hover:text-red-700"
            >
              {item.name}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
