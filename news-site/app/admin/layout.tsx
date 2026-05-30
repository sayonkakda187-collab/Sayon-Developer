import type { Metadata, Viewport } from "next";
import { Newsreader, Hanken_Grotesk } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

// Admin-only type pairing — Newsreader (serif titles) + Hanken Grotesk (UI).
// Exposed as CSS variables consumed by the .admin-shell styles in globals.css.
// The public site keeps Fraunces + Inter (root layout); these never leak there.
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

// PWA metadata scoped to /admin (the public site never links the manifest).
export const metadata: Metadata = {
  title: "Daily Ledger Admin",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Daily Ledger Admin",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#101b2d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${newsreader.variable} ${hanken.variable}`}
      style={{ display: "flex", minHeight: "100dvh", flexDirection: "column" }}
    >
      {children}
      <ServiceWorkerRegister />
    </div>
  );
}
