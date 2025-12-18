import { getLogger } from '@/src/utils/logger';
import { researchWithJina } from '@/src/core/aibot/jina/jinaResearcher';
import { researchWithDuckDuckGo } from '@/src/core/aibot/mcp/duckduckgoResearcher';
import { JINA_SEARCH_PER_KEYWORD, DEEP_SEARCH_SNIPPETS_PER_KEYWORD } from '@/src/core/aibot/constants';
import type { WebSearchSnippet, DuckDuckGoSnippet } from '@/src/core/aibot/types';

const logger = getLogger('aibot.webSearch');

// 是否使用 Jina 搜索（默认启用）
const useJinaSearch = (): boolean => {
    return process.env.USE_JINA_SEARCH !== 'false';
};

// 将 DuckDuckGo 结果转换为统一格式
const convertDuckDuckGoToWebSnippet = (snippet: DuckDuckGoSnippet): WebSearchSnippet => ({
    title: snippet.title,
    url: snippet.url,
    snippet: snippet.snippet,
    source: 'duckduckgo',
    raw: snippet.raw
});

/**
 * 统一的网络搜索入口
 *
 * 1. 优先使用 Jina Search API（USE_JINA_SEARCH=true 或未设置）
 * 2. Jina 失败时自动回退到 DuckDuckGo
 * 3. USE_JINA_SEARCH=false 时直接使用 DuckDuckGo
 */
export async function performWebSearch(
    query: string,
    topK?: number
): Promise<WebSearchSnippet[]> {
    const shouldUseJina = useJinaSearch();
    const effectiveTopK = topK ?? (shouldUseJina ? JINA_SEARCH_PER_KEYWORD : DEEP_SEARCH_SNIPPETS_PER_KEYWORD);

    logger.info('执行网络搜索', {
        query,
        topK: effectiveTopK,
        engine: shouldUseJina ? 'jina' : 'duckduckgo'
    });

    if (shouldUseJina) {
        try {
            const jinaResults = await researchWithJina(query, { topK: effectiveTopK });

            if (jinaResults.length > 0) {
                logger.info('Jina 搜索成功', {
                    query,
                    resultCount: jinaResults.length
                });
                return jinaResults;
            }

            logger.info('Jina 搜索返回空结果，尝试 DuckDuckGo 回退', { query });
        } catch (error) {
            logger.info('Jina 搜索失败，回退到 DuckDuckGo', {
                query,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    // 回退到 DuckDuckGo
    try {
        const ddgResults = await researchWithDuckDuckGo(query, { topK: effectiveTopK });
        const converted = ddgResults.map(convertDuckDuckGoToWebSnippet);

        logger.info('DuckDuckGo 搜索完成', {
            query,
            resultCount: converted.length
        });

        return converted;
    } catch (error) {
        logger.error('DuckDuckGo 搜索也失败了', {
            query,
            error: error instanceof Error ? error.message : String(error)
        });

        // 返回错误占位结果
        return [{
            title: '搜索服务暂时不可用',
            url: '',
            snippet: `无法完成对"${query}"的搜索，请稍后重试。`,
            source: 'duckduckgo',
            raw: { error: 'All search engines failed' }
        }];
    }
}
