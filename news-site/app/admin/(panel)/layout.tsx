import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logout } from "@/app/admin/actions";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-display text-lg font-bold text-fg">
              Admin
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/admin" className="text-fg-muted transition-colors hover:text-fg">
                Dashboard
              </Link>
              <Link href="/admin/articles" className="text-fg-muted transition-colors hover:text-fg">
                Articles
              </Link>
              <Link href="/admin/comments" className="text-fg-muted transition-colors hover:text-fg">
                Comments
              </Link>
              <Link href="/admin/categories" className="text-fg-muted transition-colors hover:text-fg">
                Categories &amp; Tags
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/" target="_blank" className="text-fg-faint transition-colors hover:text-fg">
              View site ↗
            </Link>
            <span className="hidden text-fg-faint sm:inline">{user.email}</span>
            <ThemeToggle />
            <form action={logout}>
              <button className="rounded-md border border-border px-3 py-1.5 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg">
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
