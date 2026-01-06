import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // 禁用 Next.js 图片优化,使用 Cloudflare R2 自己的优化能力
    // 这样可以避免私有 IP 解析问题
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
      }
    ],
  },
};

export default nextConfig;
