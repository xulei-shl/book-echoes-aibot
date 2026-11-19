import { getLogger } from '@/src/utils/logger';
import { fetchWithOptionalProxy } from '@/src/core/aibot/network/proxyFetch';
import { ANYSEARCH_MAX_RESULTS } from '@/src/core/aibot/constants';
import type { AnySearchSnippet } from '@/src/core/aibot/types';

const logger = getLogger('aibot.anysearch');

const DEFAULT_BASE_URL = 'https://api.anysearch.com';
const ANYSEARCH_SEARCH_PATH = '/v1/search';
// 客户端标识：便于服务端区分调用来源与排查问题
const CLIENT_HEADER = 'book-echoes-aibot/1.0';
const ANYSEARCH_TIMEOUT = 30000;

interface AnySearchResultItem {
    title?: string;
    url?: string;
    snippet?: string;
    content?: string;
}

interface AnySearchResponse {
    code?: number;
    message?: string;
    data?: {
        results?: AnySearchResultItem[];
    };
}

export interface AnySearchOptions {
    topK?: number;
    zone?: 'cn' | 'intl';
    language?: string;
    tag?: string;
}

const resolveBaseUrl = (): string =>
    (process.env.ANYSEARCH_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

const buildHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Anysearch-Client': CLIENT_HEADER
    };

    const apiKey = process.env.ANYSEARCH_API_KEY?.trim();
    if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
    }

    return headers;
};

const convertToSnippet = (item: AnySearchResultItem, index: number): AnySearchSnippet => ({
    title: item.title || `AnySearch 结果 ${index + 1}`,
    url: item.url || '',
    snippet: item.snippet || item.content || '',
    content: item.content,
    raw: item
});

export async function researchWithAnySearch(
    query: string,
    options?: AnySearchOptions
): Promise<AnySearchSnippet[]> {
    const q = (query || '').trim();
    if (!q) {
        return [];
    }

    const topK = Math.max(1, Math.min(options?.topK ?? ANYSEARCH_MAX_RESULTS, ANYSEARCH_MAX_RESULTS));

    const payload: Record<string, unknown> = {
        query: q,
        max_results: topK
    };
    if (options?.zone) {
        payload.zone = options.zone;
    }
    if (options?.language) {
        payload.language = options.language;
    }
    if (options?.tag) {
        payload.tag = options.tag;
    }

    logger.info('AnySearch 搜索请求', { query: q, count: topK, anonymous: !process.env.ANYSEARCH_API_KEY });

    const response = await fetchWithOptionalProxy(`${resolveBaseUrl()}${ANYSEARCH_SEARCH_PATH}`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(ANYSEARCH_TIMEOUT)
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`AnySearch 请求失败: ${response.status} ${errorText.slice(0, 300)}`.trim());
    }

    const data = (await response.json()) as AnySearchResponse;

    if (typeof data.code === 'number' && data.code !== 0) {
        throw new Error(
            `AnySearch 返回错误码 ${data.code}: ${data.message ?? ''}`.trim()
        );
    }

    const items = data.data?.results ?? [];
    const snippets = items
        .map(convertToSnippet)
        .filter(result => result.url || result.title);

    logger.info('AnySearch 搜索完成', { query: q, resultCount: snippets.length });

    return snippets;
}
