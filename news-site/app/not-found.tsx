import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center sm:px-6">
      <p className="font-serif text-6xl font-extrabold text-gray-900">404</p>
      <h1 className="mt-4 text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-gray-600">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-full bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700"
      >
        Back to home
      </Link>
    </main>
  );
}
