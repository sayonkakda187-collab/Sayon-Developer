"use client";

import { useMemo } from "react";
import {
  slugifyClient,
  lengthStatus,
  type LengthStatus,
  SEO_TITLE,
  SEO_DESC,
} from "@/lib/editorUtils";

// Public origin for the search/preview URL. NEXT_PUBLIC_SITE_URL is inlined at
// build time; falls back to the production domain for a sensible preview.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://dailyledger.today").replace(/\/$/, "");
const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");

function Meter({ label, len, min, max }: { label: string; len: number; min: number; max: number }) {
  const status: LengthStatus = lengthStatus(len, min, max);
  const tone =
    status === "good" ? "good" : status === "empty" ? "muted" : "warn";
  const msg =
    status === "empty"
      ? "empty"
      : status === "short"
        ? `${len} — a bit short (aim ${min}–${max})`
        : status === "long"
          ? `${len} — a bit long (aim ${min}–${max})`
          : `${len} — looks good`;
  return (
    <div className={`adm-seo-meter ${tone}`}>
      <span className="adm-seo-meter-label">{label}</span>
      <span className="adm-seo-meter-val">{msg}</span>
    </div>
  );
}

export function SeoPreview({
  title,
  slug,
  excerpt,
  coverImage,
}: {
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string;
}) {
  const effSlug = useMemo(() => (slug || slugifyClient(title) || "article"), [slug, title]);
  const t = title.trim() || "Your article title will appear here";
  const d = excerpt.trim() || "Your excerpt/meta description will appear here. Aim for a clear, compelling summary of the story.";

  return (
    <div className="adm-seo">
      <div className="adm-seo-block">
        <div className="adm-seo-kicker">Google result</div>
        <div className="adm-seo-google">
          <div className="adm-seo-g-url">
            <span className="adm-seo-g-favicon" aria-hidden />
            <span>
              <span className="adm-seo-g-site">{SITE_HOST}</span>
              <span className="adm-seo-g-path">› news › {effSlug}</span>
            </span>
          </div>
          <div className="adm-seo-g-title">{t}</div>
          <div className="adm-seo-g-desc">{d}</div>
        </div>
      </div>

      <div className="adm-seo-block">
        <div className="adm-seo-kicker">Facebook share</div>
        <div className="adm-seo-fb">
          <div className="adm-seo-fb-img">
            {coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverImage} alt="" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
            ) : (
              <span className="adm-seo-fb-noimg">No cover image</span>
            )}
          </div>
          <div className="adm-seo-fb-meta">
            <div className="adm-seo-fb-host">{SITE_HOST.toUpperCase()}</div>
            <div className="adm-seo-fb-title">{t}</div>
            <div className="adm-seo-fb-desc">{d}</div>
          </div>
        </div>
      </div>

      <div className="adm-seo-meters">
        <Meter label="Title" len={title.trim().length} min={SEO_TITLE.min} max={SEO_TITLE.max} />
        <Meter label="Description" len={excerpt.trim().length} min={SEO_DESC.min} max={SEO_DESC.max} />
      </div>
    </div>
  );
}
