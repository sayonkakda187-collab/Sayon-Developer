import { IMAGE_HOSTS } from "./lib/imageHosts.mjs";

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
    // Built from lib/imageHosts.mjs so the optimizer's allowlist and the server's
    // "can this cover be rendered?" check can never drift apart. Locally uploaded
    // images live under /public and need no entry here.
    remotePatterns: IMAGE_HOSTS.map((hostname) => ({ protocol: "https", hostname })),
  },
};

export default nextConfig;
