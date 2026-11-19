import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/utils/logger', () => ({
    getLogger: () => ({
        info: vi.fn(),
        error: vi.fn()
    })
}));

vi.mock('@/src/core/aibot/doubao/doubaoResearcher', () => ({
    researchWithDoubao: vi.fn()
}));

vi.mock('@/src/core/aibot/tavily/tavilyResearcher', () => ({
    researchWithTavily: vi.fn()
}));

vi.mock('@/src/core/aibot/anysearch/anysearchResearcher', () => ({
    researchWithAnySearch: vi.fn()
}));

vi.mock('@/src/core/aibot/exa/exaMcpResearcher', () => ({
    researchWithExaMcp: vi.fn()
}));

import { performWebSearch } from '@/src/core/aibot/webSearchService';
import { researchWithDoubao } from '@/src/core/aibot/doubao/doubaoResearcher';
import { researchWithTavily } from '@/src/core/aibot/tavily/tavilyResearcher';
import { researchWithAnySearch } from '@/src/core/aibot/anysearch/anysearchResearcher';
import { researchWithExaMcp } from '@/src/core/aibot/exa/exaMcpResearcher';

const doubaoResult = {
    title: '豆包结果',
    url: 'https://example.com/doubao',
    snippet: '豆包摘要',
    content: '豆包正文'
};

const tavilyResult = {
    title: 'Tavily 结果',
    url: 'https://example.com/tavily',
    snippet: '',
    content: 'Tavily 内容',
    score: 0.9
};

const anysearchResult = {
    title: 'AnySearch 结果',
    url: 'https://example.com/anysearch',
    snippet: 'AnySearch 摘要',
    content: 'AnySearch 正文'
};

const exaResult = {
    title: 'Exa 结果',
    url: 'https://example.com/exa',
    snippet: 'Exa 摘要'
};

describe('performWebSearch fallback chain', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.DOUBAO_API_KEY;
        delete process.env.TAVILY_API_KEY;
        delete process.env.ANYSEARCH_API_KEY;
    });

    it('uses Doubao first and stops when it returns results', async () => {
        process.env.DOUBAO_API_KEY = 'doubao-key';
        process.env.TAVILY_API_KEY = 'tavily-key';
        vi.mocked(researchWithDoubao).mockResolvedValue([doubaoResult]);

        const results = await performWebSearch('测试', 5);

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            title: '豆包结果',
            url: 'https://example.com/doubao',
            snippet: '豆包摘要',
            content: '豆包正文',
            source: 'doubao'
        });
        expect(researchWithDoubao).toHaveBeenCalledWith('测试', { topK: 5 });
        expect(researchWithTavily).not.toHaveBeenCalled();
        expect(researchWithAnySearch).not.toHaveBeenCalled();
        expect(researchWithExaMcp).not.toHaveBeenCalled();
    });

    it('falls back to Tavily when Doubao throws', async () => {
        process.env.DOUBAO_API_KEY = 'doubao-key';
        process.env.TAVILY_API_KEY = 'tavily-key';
        vi.mocked(researchWithDoubao).mockRejectedValue(new Error('quota exhausted'));
        vi.mocked(researchWithTavily).mockResolvedValue([tavilyResult]);

        const results = await performWebSearch('测试');

        expect(results[0].source).toBe('tavily');
        expect(results[0].snippet).toBe('Tavily 内容');
        expect(researchWithTavily).toHaveBeenCalledTimes(1);
        expect(researchWithAnySearch).not.toHaveBeenCalled();
    });

    it('treats an empty Doubao result as a failure and continues the chain', async () => {
        process.env.DOUBAO_API_KEY = 'doubao-key';
        process.env.TAVILY_API_KEY = 'tavily-key';
        vi.mocked(researchWithDoubao).mockResolvedValue([]);
        vi.mocked(researchWithTavily).mockRejectedValue(new Error('unauthorized'));
        vi.mocked(researchWithAnySearch).mockResolvedValue([anysearchResult]);

        const results = await performWebSearch('测试');

        expect(results[0].source).toBe('anysearch');
        expect(researchWithAnySearch).toHaveBeenCalledTimes(1);
        expect(researchWithExaMcp).not.toHaveBeenCalled();
    });

    it('skips keyed engines that are not configured and starts from AnySearch', async () => {
        vi.mocked(researchWithAnySearch).mockResolvedValue([anysearchResult]);

        const results = await performWebSearch('测试');

        expect(results[0].source).toBe('anysearch');
        expect(researchWithDoubao).not.toHaveBeenCalled();
        expect(researchWithTavily).not.toHaveBeenCalled();
    });

    it('falls back to Exa when all earlier engines fail', async () => {
        process.env.ANYSEARCH_API_KEY = 'anysearch-key';
        vi.mocked(researchWithAnySearch).mockRejectedValue(new Error('rate limited'));
        vi.mocked(researchWithExaMcp).mockResolvedValue([exaResult]);

        const results = await performWebSearch('测试');

        expect(results[0].source).toBe('exa');
    });

    it('returns a visible failure snippet when every engine fails', async () => {
        vi.mocked(researchWithAnySearch).mockRejectedValue(new Error('rate limited'));
        vi.mocked(researchWithExaMcp).mockRejectedValue(new Error('websocket closed'));

        const results = await performWebSearch('测试');

        expect(results).toHaveLength(1);
        expect(results[0].title).toBe('搜索服务暂时不可用');
        expect(results[0].raw).toMatchObject({
            error: 'All search engines failed'
        });
    });

    it('deduplicates results by URL', async () => {
        process.env.DOUBAO_API_KEY = 'doubao-key';
        vi.mocked(researchWithDoubao).mockResolvedValue([
            doubaoResult,
            { ...doubaoResult, title: '重复结果' }
        ]);

        const results = await performWebSearch('测试');

        expect(results).toHaveLength(1);
    });
});
