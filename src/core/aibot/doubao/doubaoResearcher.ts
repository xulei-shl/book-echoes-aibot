import { getLogger } from '@/src/utils/logger';
import { fetchWithOptionalProxy } from '@/src/core/aibot/network/proxyFetch';
import { hasDoubaoApiKey } from '@/src/core/aibot/searchConfig';
import { DOUBAO_MAX_RESULTS } from '@/src/core/aibot/constants';
import type { DoubaoSnippet } from '@/src/core/aibot/types';

const logger = getLogger('aibot.doubao');

const DOUBAO_SEARCH_URL = 'https://open.feedcoopapi.com/search_api/web_search';
const DOUBAO_TIMEOUT = 30000;

interface DoubaoWebItem {
    Title?: string;
    Url?: string;
    Snippet?: string;
    Summary?: string;
    Content?: string;
    SiteName?: string;
    PublishTime?: string;
    RankScore?: number;
}

interface DoubaoResponse {
    ResponseMetadata?: {
        Error?: {
            Code?: string;
            Message?: string;
        };
    };
    Result?: {
        WebResults?: DoubaoWebItem[];
    };
}

export interface DoubaoSearchOptions {
    topK?: number;
}

const convertToSnippet = (item: DoubaoWebItem, index: number): DoubaoSnippet => ({
    title: item.Title || `豆包结果 ${index + 1}`,
    url: item.Url || '',
    // Summary 是官方推荐的 LLM 使用字段（正文中与 query 相关的 500~1000 字段落）
    snippet: item.Summary || item.Snippet || item.Content || '',
    content: item.Content,
    score: item.RankScore,
    siteName: item.SiteName,
    publishedAt: item.PublishTime,
    raw: item
});

export async function researchWithDoubao(
    query: string,
    options?: DoubaoSearchOptions
): Promise<DoubaoSnippet[]> {
    if (!hasDoubaoApiKey()) {
        throw new Error('DOUBAO_API_KEY 未配置');
    }

    const q = (query || '').trim();
    if (!q) {
        return [];
    }

    const topK = Math.max(1, Math.min(options?.topK ?? DOUBAO_MAX_RESULTS, DOUBAO_MAX_RESULTS));

    logger.info('豆包搜索请求', { query: q, count: topK });

    const response = await fetchWithOptionalProxy(DOUBAO_SEARCH_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.DOUBAO_API_KEY}`
        },
        body: JSON.stringify({
            Query: q,
            SearchType: 'web',
            Count: topK
        }),
        signal: AbortSignal.timeout(DOUBAO_TIMEOUT)
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`豆包搜索请求失败: ${response.status} ${errorText.slice(0, 300)}`.trim());
    }

    const data = (await response.json()) as DoubaoResponse;

    const error = data.ResponseMetadata?.Error;
    if (error) {
        throw new Error(`豆包搜索失败 (${error.Code ?? 'unknown'}): ${error.Message ?? ''}`.trim());
    }

    const webResults = data.Result?.WebResults ?? [];
    const snippets = webResults
        .map(convertToSnippet)
        .filter(result => result.url || result.title);

    logger.info('豆包搜索完成', { query: q, resultCount: snippets.length });

    return snippets;
}
