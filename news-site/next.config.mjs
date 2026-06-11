/** @type {import('next').NextConfig} */
const nextConfig = {
  // The branded OG-image routes (next/og) read the vendored Playfair font from
  // disk at runtime. It isn't statically imported, so trace it into those
  // serverless bundles explicitly or it 404s on Vercel.
  experimental: {
    outputFileTracingIncludes: {
      "**/opengraph-image": ["./lib/og-playfair-700.woff"],
    },
  },
  images: {
    // Seed cover images come from Picsum (which redirects to its Fastly CDN).
    // Locally uploaded images (Phase 3) live under /public and need no entry here.
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      // Vercel Blob public URLs (admin image uploads in production).
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
};

export default nextConfig;
