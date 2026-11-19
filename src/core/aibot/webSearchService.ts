import { getLogger } from '@/src/utils/logger';
import { researchWithDoubao } from '@/src/core/aibot/doubao/doubaoResearcher';
import { researchWithTavily } from '@/src/core/aibot/tavily/tavilyResearcher';
import { researchWithAnySearch } from '@/src/core/aibot/anysearch/anysearchResearcher';
import { researchWithExaMcp } from '@/src/core/aibot/exa/exaMcpResearcher';
import { SEARCH_RESULTS_PER_KEYWORD } from '@/src/core/aibot/constants';
import { hasDoubaoApiKey, hasTavilyApiKey } from '@/src/core/aibot/searchConfig';
import type { WebSearchSnippet, WebSearchSource } from '@/src/core/aibot/types';

const logger = getLogger('aibot.webSearch');

interface SearchResultItem {
    title: string;
    url: string;
    snippet: string;
    content?: string;
    source: WebSearchSource;
    raw?: unknown;
}

interface SearchEngine {
    id: WebSearchSource;
    label: string;
    run: (query: string, topK: number) => Promise<SearchResultItem[]>;
}

interface SearchAttempt {
    engine: WebSearchSource;
    label: string;
    error: string;
}

const doubaoEngine: SearchEngine = {
    id: 'doubao',
    label: '豆包',
    async run(query, topK) {
        const results = await researchWithDoubao(query, { topK });
        return results.map(result => ({
            title: result.title,
            url: result.url,
            snippet: result.snippet,
            content: result.content,
            source: 'doubao' as const,
            raw: result.raw
        }));
    }
};

const tavilyEngine: SearchEngine = {
    id: 'tavily',
    label: 'Tavily',
    async run(query, topK) {
        const results = await researchWithTavily(query, { topK });
        return results.map(result => ({
            title: result.title,
            url: result.url,
            snippet: result.content,
            source: 'tavily' as const,
            raw: result.raw
        }));
    }
};

const anysearchEngine: SearchEngine = {
    id: 'anysearch',
    label: 'AnySearch',
    async run(query, topK) {
        const results = await researchWithAnySearch(query, { topK });
        return results.map(result => ({
            title: result.title,
            url: result.url,
            snippet: result.snippet,
            content: result.content,
            source: 'anysearch' as const,
            raw: result.raw
        }));
    }
};

const exaEngine: SearchEngine = {
    id: 'exa',
    label: 'Exa',
    async run(query, topK) {
        const results = await researchWithExaMcp(query, { topK });
        return results.map(result => ({
            title: result.title,
            url: result.url,
            snippet: result.snippet,
            source: 'exa' as const,
            raw: result.raw
        }));
    }
};

/**
 * 检索源降级链：豆包（中文深索引）→ Tavily（已有付费源）→ AnySearch（匿名兜底）→ Exa MCP。
 * 未配置 Key 的付费源会被跳过；AnySearch 与 Exa 始终可用。
 */
const buildSearchChain = (): SearchEngine[] => {
    const chain: SearchEngine[] = [];

    if (hasDoubaoApiKey()) {
        chain.push(doubaoEngine);
    }
    if (hasTavilyApiKey()) {
        chain.push(tavilyEngine);
    }

    chain.push(anysearchEngine, exaEngine);

    return chain;
};

const convertToWebSnippet = (item: SearchResultItem): WebSearchSnippet => ({
    title: item.title,
    url: item.url,
    snippet: item.snippet,
    content: item.content,
    source: item.source,
    raw: item.raw
});

const dedupeByUrl = (snippets: WebSearchSnippet[]): WebSearchSnippet[] => {
    const seen = new Set<string>();

    return snippets.filter(snippet => {
        if (!snippet.url) {
            return true;
        }
        if (seen.has(snippet.url)) {
            return false;
        }
        seen.add(snippet.url);
        return true;
    });
};

export async function performWebSearch(
    query: string,
    topK?: number
): Promise<WebSearchSnippet[]> {
    const effectiveTopK = topK !== undefined ? topK : SEARCH_RESULTS_PER_KEYWORD;
    const chain = buildSearchChain();
    const attempts: SearchAttempt[] = [];

    logger.info('执行网络搜索', {
        query,
        topK: effectiveTopK,
        chain: chain.map(engine => engine.id)
    });

    for (const engine of chain) {
        try {
            logger.info(`尝试 ${engine.label} 搜索`, { query });
            const results = await engine.run(query, effectiveTopK);

            if (results.length === 0) {
                attempts.push({ engine: engine.id, label: engine.label, error: '空结果' });
                logger.info(`${engine.label} 返回空结果，降级到下一检索源`, { query });
                continue;
            }

            logger.info(`${engine.label} 搜索成功`, {
                query,
                resultCount: results.length
            });

            return dedupeByUrl(results.map(convertToWebSnippet));
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            attempts.push({ engine: engine.id, label: engine.label, error: reason });
            logger.error(`${engine.label} 搜索失败，降级到下一检索源`, {
                query,
                error: reason
            });
        }
    }

    logger.error('所有检索源均失败', { query, attempts });

    return [{
        title: '搜索服务暂时不可用',
        url: '',
        snippet: `无法完成对"${query}"的搜索，请稍后重试。`,
        source: 'anysearch',
        raw: { error: 'All search engines failed', attempts }
    }];
}
