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

import { researchWithDoubao } from '@/src/core/aibot/doubao/doubaoResearcher';
import { fetchWithOptionalProxy } from '@/src/core/aibot/network/proxyFetch';

const mockResponse = (body: unknown, ok = true, status = 200) => ({
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body))
} as unknown as Response);

describe('Doubao Researcher', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.DOUBAO_API_KEY;
    });

    it('throws when API key is missing', async () => {
        await expect(researchWithDoubao('测试')).rejects.toThrow('DOUBAO_API_KEY 未配置');
    });

    it('sends web search request and maps results', async () => {
        process.env.DOUBAO_API_KEY = 'test-key';
        vi.mocked(fetchWithOptionalProxy).mockResolvedValue(mockResponse({
            ResponseMetadata: { RequestId: 'req-1' },
            Result: {
                WebResults: [
                    {
                        Title: '结果一',
                        Url: 'https://example.com/1',
                        Snippet: '短片段',
                        Summary: '相关摘要内容',
                        Content: '正文内容',
                        SiteName: '示例站点',
                        RankScore: 0.92
                    }
                ]
            }
        }));

        const results = await researchWithDoubao('测试', { topK: 5 });

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            title: '结果一',
            url: 'https://example.com/1',
            snippet: '相关摘要内容',
            content: '正文内容',
            siteName: '示例站点',
            score: 0.92
        });

        const [url, options] = vi.mocked(fetchWithOptionalProxy).mock.calls[0];
        expect(url).toBe('https://open.feedcoopapi.com/search_api/web_search');
        expect(JSON.parse(String(options?.body))).toEqual({
            Query: '测试',
            SearchType: 'web',
            Count: 5
        });
        expect((options?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    });

    it('throws when ResponseMetadata contains an error', async () => {
        process.env.DOUBAO_API_KEY = 'test-key';
        vi.mocked(fetchWithOptionalProxy).mockResolvedValue(mockResponse({
            ResponseMetadata: {
                Error: { Code: '100013', Message: 'AccessDenied' }
            }
        }));

        await expect(researchWithDoubao('测试')).rejects.toThrow('豆包搜索失败 (100013): AccessDenied');
    });

    it('throws on HTTP failure', async () => {
        process.env.DOUBAO_API_KEY = 'test-key';
        vi.mocked(fetchWithOptionalProxy).mockResolvedValue(mockResponse('Unauthorized', false, 401));

        await expect(researchWithDoubao('测试')).rejects.toThrow('豆包搜索请求失败: 401');
    });
});
