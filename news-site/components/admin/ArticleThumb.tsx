"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Small article avatar for admin lists. Shows the article's COVER IMAGE as a
 * rounded thumbnail (next/image — lazy, optimized, object-cover) rendered INSIDE
 * the same `.adm-ini` box the letter tile used, so every row's size/alignment is
 * unchanged. Falls back to the title's first-letter tile when there's no cover,
 * or if the image fails to load — never a broken image.
 */
export function ArticleThumb({ cover, title }: { cover?: string | null; title: string }) {
  const [broken, setBroken] = useState(false);
  const initial = title.slice(0, 1).toUpperCase() || "·";

  if (!cover || broken) {
    return <span className="adm-ini">{initial}</span>;
  }
  return (
    <span className="adm-ini adm-thumb">
      <Image
        src={cover}
        alt=""
        fill
        sizes="64px"
        style={{ objectFit: "cover" }}
        onError={() => setBroken(true)}
      />
    </span>
  );
}
