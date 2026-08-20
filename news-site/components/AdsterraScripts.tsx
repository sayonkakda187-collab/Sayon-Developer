import Script from "next/script";
import {
  SOCIAL_BAR_SRC,
  POPUNDER_SRC,
  IN_PAGE_PUSH_SRC,
  scriptLive,
  httpsSrc,
} from "@/lib/adsterra";

/**
 * Adsterra's SELF-DISPLAYING formats — Social Bar, Popunder and In-Page Push.
 *
 * Each is a single script that positions/triggers itself per its dashboard
 * settings, so there is no container to place: mounting it once site-wide is
 * enough. Rendered from the PUBLIC layout only (never /admin), and only for the
 * units whose src has actually been filled in — an unconfigured unit emits
 * nothing at all, so the page stays clean.
 *
 * `afterInteractive` lets the page content paint first; the scripts are async
 * and non-blocking.
 */
export function AdsterraScripts() {
  const units: [string, string][] = [
    ["adsterra-social-bar", SOCIAL_BAR_SRC],
    ["adsterra-popunder", POPUNDER_SRC],
    ["adsterra-inpage-push", IN_PAGE_PUSH_SRC],
  ];
  const live = units.filter(([, src]) => scriptLive(src));
  if (live.length === 0) return null;

  return (
    <>
      {live.map(([id, src]) => (
        <Script key={id} id={id} src={httpsSrc(src)} strategy="afterInteractive" async />
      ))}
    </>
  );
}
