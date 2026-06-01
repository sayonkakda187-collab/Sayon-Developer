import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { ViewTransitions } from "next-view-transitions";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
      className={`${fraunces.variable} ${inter.variable}`}
    >
      <body className="flex min-h-screen flex-col bg-bg font-sans text-fg antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <ViewTransitions>{children}</ViewTransitions>
      </body>
    </html>
  );
}
