import type { Metadata } from "next";
import type { CSSProperties } from "react";
import "./globals.css";

type FontVarStyle = CSSProperties & Record<string, string>;

export const metadata: Metadata = {
  title: "书海回响",
  description: "基于上海图书馆借阅数据的书目推荐项目",
  icons: {
    icon: [
      { url: "/ico_64.ico", sizes: "64x64", type: "image/x-icon" },
      { url: "/ico_48.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/ico_32.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/ico_16.ico", sizes: "16x16", type: "image/x-icon" },
    ],
    apple: "/logo_shl.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fontHost = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL || process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  const fontVars: FontVarStyle = {};

  if (fontHost) {
    fontVars["--font-shangtu-src"] = `url('${fontHost}/fonts/shangtu-dongguan.woff2') format('woff2')`;
    fontVars["--font-youyou-src"] = `url('${fontHost}/fonts/youyou-yisong.woff2') format('woff2')`;
    fontVars["--font-runzhijia-src"] = `url('${fontHost}/fonts/runzhijia-ruyin.woff2') format('woff2')`;
    fontVars["--font-huiwen-src"] = `url('${fontHost}/fonts/huiwen-mingchao.woff2') format('woff2')`;
  }

  return (
    <html lang="zh-CN">
      <body className="antialiased" suppressHydrationWarning style={fontVars}>
        {children}
      </body>
    </html>
  );
}
