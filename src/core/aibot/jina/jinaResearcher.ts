import { getLogger } from '@/src/utils/logger';
import { JINA_SEARCH_PER_KEYWORD, JINA_API_TIMEOUT } from '@/src/core/aibot/constants';
import type { JinaSearchOptions, WebSearchSnippet } from '@/src/core/aibot/types';

const logger = getLogger('aibot.jina');

// Jina API 基础 URL
const JINA_SEARCH_URL = 'https://s.jina.ai/';
const JINA_READER_URL = 'https://r.jina.ai/';

// 从环境变量获取 API Key
const getJinaApiKey = (): string | undefined => {
    return process.env.JINA_API_KEY;
};

// 是否启用全文获取（Reader API）
const shouldFetchContent = (): boolean => {
    return process.env.JINA_FETCH_CONTENT === 'true';
};

// Jina Search API 响应类型
interface JinaSearchResponse {
    code: number;
    status: number;
    data: Array<{
        title: string;
        description: string;
        url: string;
        content?: string;
    }>;
}

// Jina Reader API 响应类型
interface JinaReaderResponse {
    code: number;
    status: number;
    data: {
        title: string;
        description?: string;
        url: string;
        content: string;
    };
}

/**
 * 使用 Jina Search API 进行网络搜索
 */
export async function searchWithJina(
    query: string,
    options?: JinaSearchOptions
): Promise<WebSearchSnippet[]> {
    const apiKey = getJinaApiKey();

    if (!apiKey) {
        logger.error('JINA_API_KEY 未配置');
        throw new Error('JINA_API_KEY 未配置，请在 .env.local 中设置');
    }

    const topK = options?.topK ?? JINA_SEARCH_PER_KEYWORD;

    logger.info('开始 Jina Search API 请求', { query, topK });

    try {
        const response = await fetch(JINA_SEARCH_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                q: query,
                num: topK
            }),
            signal: AbortSignal.timeout(JINA_API_TIMEOUT)
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error('Jina Search API 请求失败', {
                status: response.status,
                error: errorText
            });
            throw new Error(`Jina Search API 请求失败: ${response.status}`);
        }

        const result = await response.json() as JinaSearchResponse;

        if (!result.data || !Array.isArray(result.data)) {
            logger.info('Jina Search API 返回数据格式异常', { result });
            return [];
        }

        const snippets: WebSearchSnippet[] = result.data.map((item, index) => ({
            title: item.title || `搜索结果 ${index + 1}`,
            url: item.url || '',
            snippet: item.description || item.content?.slice(0, 200) || '暂无摘要',
            content: item.content,
            source: 'jina' as const,
            raw: item
        }));

        logger.info('Jina Search API 请求成功', {
            query,
            resultCount: snippets.length
        });

        return snippets;
    } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') {
            logger.error('Jina Search API 请求超时', { query });
            throw new Error('Jina Search API 请求超时');
        }
        throw error;
    }
}

/**
 * 使用 Jina Reader API 获取网页全文
 *
 * 注意：当前默认不启用，可通过 JINA_FETCH_CONTENT=true 开启
 */
export async function fetchPageContent(url: string): Promise<string | null> {
    const apiKey = getJinaApiKey();

    if (!apiKey) {
        logger.info('JINA_API_KEY 未配置，无法获取页面内容');
        return null;
    }

    logger.info('开始 Jina Reader API 请求', { url });

    try {
        const response = await fetch(JINA_READER_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ url }),
            signal: AbortSignal.timeout(JINA_API_TIMEOUT)
        });

        if (!response.ok) {
            logger.info('Jina Reader API 请求失败', {
                url,
                status: response.status
            });
            return null;
        }

        const result = await response.json() as JinaReaderResponse;

        if (!result.data?.content) {
            logger.info('Jina Reader API 返回内容为空', { url });
            return null;
        }

        logger.info('Jina Reader API 请求成功', {
            url,
            contentLength: result.data.content.length
        });

        return result.data.content;
    } catch (error) {
        logger.error('Jina Reader API 请求异常', { url, error });
        return null;
    }
}

/**
 * 综合搜索并获取内容（主入口）
 *
 * 1. 调用 Search API 获取搜索结果
 * 2. 如果启用全文获取（JINA_FETCH_CONTENT=true），则调用 Reader API 补充内容
 */
export async function researchWithJina(
    query: string,
    options?: JinaSearchOptions
): Promise<WebSearchSnippet[]> {
    // 步骤 1：搜索
    const snippets = await searchWithJina(query, options);

    if (snippets.length === 0) {
        return [];
    }

    // 步骤 2：是否需要获取全文
    const fetchContent = options?.withContent ?? shouldFetchContent();

    if (!fetchContent) {
        logger.info('跳过全文获取（未启用）', { query });
        return snippets;
    }

    // 步骤 3：并行获取全文内容
    logger.info('开始批量获取全文内容', {
        query,
        urlCount: snippets.length
    });

    const contentPromises = snippets.map(async (snippet) => {
        if (!snippet.url || snippet.content) {
            return snippet;
        }

        const content = await fetchPageContent(snippet.url);
        if (content) {
            return { ...snippet, content };
        }
        return snippet;
    });

    const enrichedSnippets = await Promise.all(contentPromises);

    logger.info('全文获取完成', {
        query,
        enrichedCount: enrichedSnippets.filter(s => s.content).length
    });

    return enrichedSnippets;
}
