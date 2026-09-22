import { describe, it, expect } from 'vitest';
import { sameOrigin } from '@/src/utils/same-origin';

/** 构造只带请求头的 Request 替身；sameOrigin 只读取 headers。 */
function req(headers: Record<string, string>): Request {
    return { headers: new Headers(headers) } as Request;
}

describe('sameOrigin', () => {
    it('Origin 与 Host 一致时放行（含局域网 IP，Next 会把 request.url 归一化到 localhost）', () => {
        expect(sameOrigin(req({ host: '10.40.92.18:3000', origin: 'http://10.40.92.18:3000' }))).toBe(true);
        expect(sameOrigin(req({ host: 'localhost:3000', origin: 'http://localhost:3000' }))).toBe(true);
    });

    it('Origin 与 Host 不一致时判定为跨源', () => {
        expect(sameOrigin(req({ host: '10.40.92.18:3000', origin: 'https://evil.example' }))).toBe(false);
        expect(sameOrigin(req({ host: 'localhost:3000', origin: 'http://10.40.92.18:3000' }))).toBe(false);
    });

    it('有 Origin 但没有 Host 头时按跨源拒绝', () => {
        expect(sameOrigin(req({ origin: 'http://10.40.92.18:3000' }))).toBe(false);
    });

    it('Origin 不是合法 URL 时按跨源拒绝', () => {
        expect(sameOrigin(req({ host: '10.40.92.18:3000', origin: 'not-a-url' }))).toBe(false);
    });

    it('缺少 Origin 时回退到 Sec-Fetch-Site', () => {
        expect(sameOrigin(req({ 'sec-fetch-site': 'same-origin' }))).toBe(true);
        expect(sameOrigin(req({ 'sec-fetch-site': 'cross-site' }))).toBe(false);
        expect(sameOrigin(req({ 'sec-fetch-site': 'same-site' }))).toBe(false);
    });

    it('Origin 与 Sec-Fetch-Site 都缺失时放行（curl / 服务端调用）', () => {
        expect(sameOrigin(req({}))).toBe(true);
    });
});
