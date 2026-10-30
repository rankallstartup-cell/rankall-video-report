import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serve images as AVIF (best compression) with WebP fallback, and let
  // next/image generate responsive sizes — the old setup had zero
  // next/image usage and raw <img> tags with no optimization.
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // Gzip/Brotli compression for HTML/JS/CSS responses.
  compress: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
