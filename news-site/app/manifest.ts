import type { MetadataRoute } from "next";

// Installable admin app. Scoped to /admin so the public site is unaffected.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Daily Ledger Admin",
    short_name: "DL Admin",
    description: "Publish and manage The Daily Ledger from your phone.",
    start_url: "/admin",
    scope: "/admin",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3f4f6",
    theme_color: "#111827",
    icons: [
      { src: "/icons/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
