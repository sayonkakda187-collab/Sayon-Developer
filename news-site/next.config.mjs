/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Seed cover images come from Picsum (which redirects to its Fastly CDN).
    // Locally uploaded images (Phase 3) live under /public and need no entry here.
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
    ],
  },
};

export default nextConfig;
