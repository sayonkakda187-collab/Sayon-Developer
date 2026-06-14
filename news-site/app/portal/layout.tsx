import type { Metadata, Viewport } from "next";
import { Newsreader, Hanken_Grotesk } from "next/font/google";

// The Manager Portal is a STANDALONE, shareable magic-link surface — NOT the admin
// shell, and never login-gated. It reuses the Page Control admin styling, so it loads
// the same admin type pairing (Newsreader + Hanken Grotesk) and exposes them as the
// CSS variables the `.admin-shell` styles consume.
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-newsreader",
  display: "swap",
});
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-hanken",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Manager Portal · The Daily Ledger",
  // A magic-link page — keep it out of search engines.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0b1220",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Runs before paint (portal pages only): resolves the portal theme from
// localStorage('portal-theme') or the visitor's device setting and stamps
// data-adm-theme on <html>, so the reused admin styling shows the right light/dark
// surface with no flash. Independent of both the admin theme and the public site theme.
const portalThemeInit = `(function(){try{var t=localStorage.getItem('portal-theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=t?t==='dark':m;document.documentElement.setAttribute('data-adm-theme',d?'dark':'light');}catch(e){}})();`;

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${newsreader.variable} ${hanken.variable}`}
      style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100dvh" }}
    >
      <script dangerouslySetInnerHTML={{ __html: portalThemeInit }} />
      {children}
    </div>
  );
}
