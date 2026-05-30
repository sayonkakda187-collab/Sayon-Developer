import { Skeleton, ArticleGridSkeleton } from "@/components/Skeleton";

// Instant shell for search while results stream in.
export default function SearchLoading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Skeleton className="h-10 w-48 rounded" />
      <div className="mt-5 max-w-xl">
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
      <div className="mt-8">
        <ArticleGridSkeleton count={4} />
      </div>
    </main>
  );
}
