/**
 * Cloudflare 图片加载器
 * 
 * Cloudflare R2 + CDN 支持自动图片优化
 * 此 loader 保持原始 URL 不变,让 Cloudflare 处理优化
 */

interface ImageLoaderProps {
    src: string;
    width: number;
    quality?: number;
}

export default function cloudflareLoader({ src, width, quality }: ImageLoaderProps): string {
    // 如果是外部 URL (Cloudflare R2 或豆瓣),直接返回
    // Cloudflare 会自动优化通过其 CDN 的图片
    if (src.startsWith('http://') || src.startsWith('https://')) {
        return src;
    }

    // 如果是本地路径,也直接返回
    // Next.js 会通过其内置优化 API 处理
    return src;
}
