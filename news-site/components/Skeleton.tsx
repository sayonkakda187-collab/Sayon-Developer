// Lightweight, server-rendered skeleton placeholders (no client JS). Used by
// loading.tsx route shells so navigations show an instant layout-matched
// placeholder instead of a blank/frozen screen. The shimmer respects
// prefers-reduced-motion (see `.sk` in globals.css).

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`sk ${className}`} aria-hidden />;
}

// Mirrors <ArticleCard> exactly so swapping in real content causes no layout shift.
export function ArticleCardSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <Skeleton className="aspect-[16/10] w-full rounded-md" />
      <div className="mt-2.5 flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-[92%] rounded" />
        <Skeleton className="h-4 w-[70%] rounded" />
        <Skeleton className="mt-1 h-2.5 w-20 rounded" />
      </div>
    </div>
  );
}

// A responsive grid of card skeletons (matches the 1/2/4-col article grids).
export function ArticleGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <ArticleCardSkeleton key={i} />
      ))}
    </div>
  );
}
