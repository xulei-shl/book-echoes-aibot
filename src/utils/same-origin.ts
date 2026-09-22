/**
 * 同源校验：带 Origin / Sec-Fetch-Site 时必须与本次请求的目标主机一致；
 * 两者都缺失（curl、服务端调用）放行。README 式诚实标注：这不是认证。
 *
 * 不能用 `new URL(request.url).origin` 作为期望值：Next.js 会把 Route Handler 的
 * `request.url` 归一化到 localhost（忽略真实 Host 头），于是经局域网 IP / 反向代理访问时
 * 浏览器送来的 Origin 永远对不上，同源请求会被误判为跨源、稳定返回 403。
 * Origin 由浏览器控制、Host 是本次请求的目标主机，直接比对二者的 host 即可。
 */
export function sameOrigin(request: Request): boolean {
    const origin = request.headers.get('origin');
    if (origin) {
        const host = request.headers.get('host');
        if (!host) return false;
        try {
            return new URL(origin).host === host;
        } catch {
            return false;
        }
    }
    const fetchSite = request.headers.get('sec-fetch-site');
    if (fetchSite) return fetchSite === 'same-origin';
    return true;
}
