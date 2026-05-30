import { Skeleton } from "@/components/Skeleton";

// Instant shell for an article while it loads — mirrors the immersive hero +
// reading column so the real content swaps in without a layout jump. The hero
// block carries the shared view-transition name so the card→article morph still
// lands on a stable target during navigation.
export default function ArticleLoading() {
  return (
    <main>
      <header className="relative isolate">
        <div
          className="relative h-[58vh] min-h-[380px] w-full sm:h-[66vh]"
          style={{ viewTransitionName: "shared-article-image" }}
        >
          <Skeleton className="h-full w-full rounded-none" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="mx-auto max-w-prose space-y-4">
          <Skeleton className="h-6 w-3/4 rounded" />
          <div className="space-y-3 pt-4">
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-[88%] rounded" />
            <Skeleton className="h-4 w-[95%] rounded" />
            <Skeleton className="h-4 w-[70%] rounded" />
          </div>
        </div>
      </div>
    </main>
  );
}
