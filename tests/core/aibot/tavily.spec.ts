import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasTavilyApiKey, researchWithTavily } from '@/src/core/aibot/tavily/tavilyResearcher';

vi.mock('@/src/utils/logger', () => ({
    getLogger: () => ({
        info: vi.fn(),
        error: vi.fn()
    })
}));

vi.mock('@/src/core/aibot/network/proxyFetch', () => ({
    fetchWithOptionalProxy: vi.fn()
}));

describe('Tavily Researcher', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.TAVILY_API_KEY;
    });

    describe('hasTavilyApiKey', () => {
        it('returns false when API key is not set', () => {
            expect(hasTavilyApiKey()).toBe(false);
        });

        it('returns false when API key is empty string', () => {
            process.env.TAVILY_API_KEY = '';
            expect(hasTavilyApiKey()).toBe(false);
        });

        it('returns false when API key is whitespace only', () => {
            process.env.TAVILY_API_KEY = '   ';
            expect(hasTavilyApiKey()).toBe(false);
        });

        it('returns true when API key is set', () => {
            process.env.TAVILY_API_KEY = 'test-api-key-123';
            expect(hasTavilyApiKey()).toBe(true);
        });
    });

    describe('researchWithTavily', () => {
        it('throws error when API key is not configured', async () => {
            await expect(researchWithTavily('test query')).rejects.toThrow('Tavily API key 未配置');
        });

        it('returns empty array when API returns no results', async () => {
            process.env.TAVILY_API_KEY = 'test-key';
            const { fetchWithOptionalProxy } = await import('@/src/core/aibot/network/proxyFetch');
            
            vi.mocked(fetchWithOptionalProxy).mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({ results: [] })
            } as any);

            const results = await researchWithTavily('empty query');
            expect(results).toEqual([]);
        });

        it('parses API response correctly', async () => {
            process.env.TAVILY_API_KEY = 'test-key';
            const { fetchWithOptionalProxy } = await import('@/src/core/aibot/network/proxyFetch');
            
            vi.mocked(fetchWithOptionalProxy).mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({
                    results: [
                        { title: 'Result 1', url: 'https://example.com/1', content: 'Content 1', score: 0.9 },
                        { title: 'Result 2', url: 'https://example.com/2', content: 'Content 2', score: 0.8 }
                    ]
                })
            } as any);

            const results = await researchWithTavily('test query', { topK: 5 });

            expect(results).toHaveLength(2);
            expect(results[0].title).toBe('Result 1');
            expect(results[0].url).toBe('https://example.com/1');
            expect(results[0].content).toBe('Content 1');
            expect(results[0].score).toBe(0.9);
            expect(results[1].raw).toBeDefined();
        });

        it('throws error when API request fails', async () => {
            process.env.TAVILY_API_KEY = 'test-key';
            const { fetchWithOptionalProxy } = await import('@/src/core/aibot/network/proxyFetch');
            
            vi.mocked(fetchWithOptionalProxy).mockResolvedValue({
                ok: false,
                status: 401,
                text: vi.fn().mockResolvedValue('Unauthorized')
            } as any);

            await expect(researchWithTavily('test query')).rejects.toThrow('Tavily API 请求失败: 401');
        });
    });
});