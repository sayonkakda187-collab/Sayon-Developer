import type { Metadata } from "next";
import { Newsreader, Schibsted_Grotesk, Playfair_Display } from "next/font/google";
import "./globals.css";
import { ViewTransitions } from "next-view-transitions";
import { siteConfig } from "@/lib/site";
import { AdSenseHead } from "@/components/AdSenseHead";
import { ADSENSE_PUBLISHER_ID } from "@/lib/ads";

export const dynamic = "force-dynamic";

// Editorial type pairing for the public site: Newsreader (serif headlines +
// wordmark — optical sizing, italics) + Schibsted Grotesk (UI / labels / meta).
// Exposed as --font-head / --font-ui (Tailwind font-display / font-sans map to
// them in tailwind.config).
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-head",
  display: "swap",
});
const schibsted = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui",
  display: "swap",
});
// Display serif for the masthead wordmark ONLY (navy + gold serif look) —
// exposed as --font-masthead, used by .tl-wm-* in globals.css.
const playfair = Playfair_Display({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "700"],
  variable: "--font-masthead",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
  },
  twitter: { card: "summary_large_image" },
  // Google AdSense site verification. A SERVER-RENDERED <meta> tag in <head> is
  // Google's recommended verification signal — and, unlike a next/script tag
  // (loaded by the Next.js runtime), it's guaranteed to be in the RAW server HTML
  // the crawler reads WITHOUT executing JS. Renders:
  //   <meta name="google-adsense-account" content="ca-pub-5470257305108580">
  other: { "google-adsense-account": ADSENSE_PUBLISHER_ID },
};

// Runs before paint: sets the theme class (no flash) and marks `js` enabled so
// CSS scroll-reveals only hide content when JavaScript can reveal it.
// First paint: apply the theme with no flash. An explicit stored choice wins
// ("dark"/"light"/"system"); with nothing stored we default to DARK (the
// polished default for this news look) rather than the OS preference. The
// toggle + persistence are unchanged.
const themeInit = `(function(){try{var r=document.documentElement;r.classList.add('js');var t=localStorage.getItem('theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=t?(t==='dark'||(t==='system'&&m)):true;r.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${newsreader.variable} ${schibsted.variable} ${playfair.variable}`}
    >
      <body className="flex min-h-screen flex-col bg-bg font-sans text-fg antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <ViewTransitions>{children}</ViewTransitions>
      </body>
      {/* Google AdSense account script — server-injected into <head> for site
          verification/review. Site-wide; loads on every page. */}
      <AdSenseHead />
    </html>
  );
}
