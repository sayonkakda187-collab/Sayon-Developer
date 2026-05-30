import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

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
  themeColor: "#111827",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <ServiceWorkerRegister />
    </>
  );
}
