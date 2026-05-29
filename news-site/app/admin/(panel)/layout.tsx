import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logout } from "@/app/admin/actions";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-serif text-lg font-extrabold">
              Admin
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/admin" className="text-gray-600 hover:text-gray-900">
                Dashboard
              </Link>
              <Link
                href="/admin/articles"
                className="text-gray-600 hover:text-gray-900"
              >
                Articles
              </Link>
              <Link
                href="/admin/categories"
                className="text-gray-600 hover:text-gray-900"
              >
                Categories &amp; Tags
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/"
              target="_blank"
              className="text-gray-500 hover:text-gray-900"
            >
              View site ↗
            </Link>
            <span className="hidden text-gray-400 sm:inline">{user.email}</span>
            <form action={logout}>
              <button className="rounded-md border border-gray-300 px-3 py-1 hover:bg-gray-100">
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
