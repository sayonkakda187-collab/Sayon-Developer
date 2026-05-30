import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-6xl flex-col items-center justify-center px-4 py-24 text-center sm:px-6">
      <p className="font-display text-7xl font-bold tracking-tight text-accent sm:text-8xl">
        404
      </p>
      <h1 className="mt-6 font-display text-2xl font-bold tracking-tight">
        Page not found
      </h1>
      <p className="mt-3 max-w-md text-fg-muted">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-fg transition hover:opacity-90"
      >
        Back to home
      </Link>
    </main>
  );
}
