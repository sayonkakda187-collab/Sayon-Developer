"use client";

import { useState } from "react";
import { countryFlag } from "@/lib/countries";

/**
 * Real country flag as an image (flagcdn) so it renders on EVERY OS. Windows has
 * no flag-emoji glyphs and shows the bare country code (e.g. "US") instead — which
 * is why the emoji approach looked wrong there. Falls back to the emoji
 * (Mac/Linux/Android) or the code if the image can't load.
 */
export function CountryFlag({ code, width = 22 }: { code: string; width?: number }) {
  const [failed, setFailed] = useState(false);
  const cc = (code || "").trim().toLowerCase();
  const w = Math.round(width);
  const h = Math.round(width * 0.72);

  if (failed || !/^[a-z]{2}$/.test(cc)) {
    return (
      <span aria-hidden style={{ fontSize: w * 0.86, lineHeight: 1 }}>
        {countryFlag(code)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w80/${cc}.png`}
      width={w}
      height={h}
      alt=""
      aria-hidden
      loading="lazy"
      onError={() => setFailed(true)}
      style={{
        width: w,
        height: h,
        objectFit: "cover",
        borderRadius: 3,
        boxShadow: "0 0 0 1px rgba(0,0,0,.12)",
        display: "inline-block",
        verticalAlign: "middle",
      }}
    />
  );
}
