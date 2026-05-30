import { Skeleton, ArticleGridSkeleton } from "@/components/Skeleton";

// Instant shell for a category page while its articles load.
export default function CategoryLoading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <header className="border-b border-border pb-5">
        <Skeleton className="h-3 w-20 rounded" />
        <Skeleton className="mt-3 h-10 w-64 rounded" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full rounded" />
      </header>
      <div className="mt-8">
        <ArticleGridSkeleton count={8} />
      </div>
    </main>
  );
}
