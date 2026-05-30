import { Skeleton, ArticleGridSkeleton } from "@/components/Skeleton";

// Instant shell for the homepage while data streams in (no blank/frozen frame).
export default function HomeLoading() {
  return (
    <div>
      <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8">
        <Skeleton className="aspect-[4/3] w-full rounded-lg sm:aspect-[16/9] lg:aspect-[2.4/1]" />
      </section>
      <section className="py-10 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6 border-b border-border pb-2.5">
            <Skeleton className="h-7 w-44 rounded" />
          </div>
          <ArticleGridSkeleton count={8} />
        </div>
      </section>
    </div>
  );
}
