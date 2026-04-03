import { getLogger } from '@/src/utils/logger';
import { fetchWithOptionalProxy } from '@/src/core/aibot/network/proxyFetch';
import type { TavilySnippet, TavilySearchOptions } from '@/src/core/aibot/types';
import { MAX_SNIPPETS } from '@/src/core/aibot/constants';

const logger = getLogger('aibot.tavily');

const TAVILY_API_BASE = 'https://api.tavily.com/search';

export const hasTavilyApiKey = (): boolean => {
    const apiKey = process.env.TAVILY_API_KEY;
    return Boolean(apiKey && apiKey.trim().length > 0);
};

interface TavilyResponse {
    results: Array<{
        title: string;
        url: string;
        content: string;
        score: number;
    }>;
    answer?: string;
}

const convertToSnippet = (result: TavilyResponse['results'][0], index: number): TavilySnippet => ({
    title: result.title ?? `Tavily 结果 ${index + 1}`,
    url: result.url ?? '',
    content: result.content ?? '',
    score: result.score ?? 0,
    raw: result
});

export async function researchWithTavily(
    query: string,
    options?: TavilySearchOptions
): Promise<TavilySnippet[]> {
    const apiKey = process.env.TAVILY_API_KEY;
    
    if (!apiKey) {
        logger.info('Tavily API key 未配置');
        throw new Error('Tavily API key 未配置');
    }

    const topK = options?.topK ?? MAX_SNIPPETS;
    const searchDepth = options?.searchDepth ?? 'basic';

    const requestBody = {
        query,
        max_results: topK,
        search_depth: searchDepth,
        include_answer: options?.includeAnswer ?? false,
        include_raw_content: options?.includeRawContent ?? false,
        include_images: false,
        include_image_descriptions: false,
        include_favicon: false
    };

    logger.info('Tavily 搜索请求', { query, max_results: topK, search_depth: searchDepth });

    try {
        const response = await fetchWithOptionalProxy(TAVILY_API_BASE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(30000)
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            logger.error('Tavily API 请求失败', { status: response.status, error: errorText });
            throw new Error(`Tavily API 请求失败: ${response.status}`);
        }

        const data: TavilyResponse = await response.json();
        
        if (!data.results || data.results.length === 0) {
            logger.info('Tavily 返回空结果', { query });
            return [];
        }

        const snippets = data.results.map(convertToSnippet);
        
        logger.info('Tavily 搜索成功', { 
            query, 
            resultCount: snippets.length 
        });

        return snippets;
    } catch (error) {
        logger.error('Tavily 搜索失败', { 
            query, 
            error: error instanceof Error ? error.message : String(error) 
        });
        throw error;
    }
}