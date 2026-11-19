import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/utils/logger', () => ({
    getLogger: () => ({
        info: vi.fn(),
        error: vi.fn()
    })
}));

vi.mock('@/src/core/aibot/network/proxyFetch', () => ({
    fetchWithOptionalProxy: vi.fn()
}));

import { researchWithAnySearch } from '@/src/core/aibot/anysearch/anysearchResearcher';
import { fetchWithOptionalProxy } from '@/src/core/aibot/network/proxyFetch';

const mockResponse = (body: unknown, ok = true, status = 200) => ({
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body))
} as unknown as Response);

describe('AnySearch Researcher', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.ANYSEARCH_API_KEY;
        delete process.env.ANYSEARCH_API_BASE_URL;
    });

    it('supports anonymous calls without an Authorization header', async () => {
        vi.mocked(fetchWithOptionalProxy).mockResolvedValue(mockResponse({
            code: 0,
            data: {
                results: [
                    { title: '结果一', url: 'https://example.com/1', snippet: '摘要', content: '正文' }
                ]
            }
        }));

        const results = await researchWithAnySearch('测试', { topK: 3 });

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            title: '结果一',
            url: 'https://example.com/1',
            snippet: '摘要',
            content: '正文'
        });

        const [url, options] = vi.mocked(fetchWithOptionalProxy).mock.calls[0];
        expect(url).toBe('https://api.anysearch.com/v1/search');
        expect((options?.headers as Record<string, string>).Authorization).toBeUndefined();
        expect(JSON.parse(String(options?.body))).toEqual({ query: '测试', max_results: 3 });
    });

    it('sends the API key when configured and honours a custom base URL', async () => {
        process.env.ANYSEARCH_API_KEY = 'test-key';
        process.env.ANYSEARCH_API_BASE_URL = 'https://proxy.example.com/';
        vi.mocked(fetchWithOptionalProxy).mockResolvedValue(mockResponse({ code: 0, data: { results: [] } }));

        await researchWithAnySearch('测试');

        const [url, options] = vi.mocked(fetchWithOptionalProxy).mock.calls[0];
        expect(url).toBe('https://proxy.example.com/v1/search');
        expect((options?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    });

    it('falls back to content when snippet is missing', async () => {
        vi.mocked(fetchWithOptionalProxy).mockResolvedValue(mockResponse({
            code: 0,
            data: {
                results: [{ title: '结果一', url: 'https://example.com/1', content: '正文内容' }]
            }
        }));

        const results = await researchWithAnySearch('测试');

        expect(results[0].snippet).toBe('正文内容');
    });

    it('throws when the response envelope reports an error code', async () => {
        vi.mocked(fetchWithOptionalProxy).mockResolvedValue(mockResponse({
            code: -1,
            message: 'rate limited'
        }));

        await expect(researchWithAnySearch('测试')).rejects.toThrow('AnySearch 返回错误码 -1: rate limited');
    });

    it('throws on HTTP failure', async () => {
        vi.mocked(fetchWithOptionalProxy).mockResolvedValue(mockResponse('Forbidden', false, 403));

        await expect(researchWithAnySearch('测试')).rejects.toThrow('AnySearch 请求失败: 403');
    });
});
