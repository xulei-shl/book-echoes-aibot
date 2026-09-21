import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "book-echoes.xulei-shl.asia",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "img3.doubanio.com",
        pathname: "/**",
      },
    ],
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
