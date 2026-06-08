import { Link } from "next-view-transitions";
import { siteConfig } from "@/lib/site";

/**
 * Centered serif masthead — navy wordmark + gold rule + dateline, newspaper
 * style. The wordmark is LIVE TEXT (not an image/SVG) so it stays crisp and
 * follows the light/dark theme. The whole block links home.
 *
 * Fonts: the wordmark uses Playfair Display (var(--font-playfair) → `font-masthead`,
 * wired in the root layout + tailwind config); the dateline uses the site sans
 * (Inter). Colors are exact brand values via `dark:` arbitrary hex (the site uses
 * class-based dark mode). The wordmark scales smoothly with clamp(); the dateline
 * is hidden on small screens to stay clean.
 */
export function Masthead() {
  return (
    <header className="flex justify-center px-4 pb-4 pt-6">
      <Link
        href="/"
        aria-label={siteConfig.name}
        className="flex w-full max-w-2xl flex-col items-center gap-2 text-center"
      >
        <span className="font-masthead text-[clamp(1.75rem,7vw,2.75rem)] font-bold leading-none text-[#1b3a5f] dark:text-[#aec6e2]">
          {siteConfig.name}
        </span>
        <span
          aria-hidden
          className="block w-[340px] max-w-[82%] border-t-[1.5px] border-[#b8893b] dark:border-[#c9a24e]"
        />
        <span className="hidden gap-5 font-sans text-[11px] font-medium uppercase tracking-[0.2em] text-[#8a6a22] dark:text-[#c9a24e] sm:flex">
          <span>VOL. I</span>
          <span>EST. 2026</span>
          <span>WORLD NEWS</span>
        </span>
      </Link>
    </header>
  );
}
