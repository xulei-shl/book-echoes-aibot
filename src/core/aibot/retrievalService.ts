import { DEFAULT_PLAIN_TEXT_TEMPLATE } from '@/src/utils/aibot-env';
import { getBookApiBase } from '@/src/utils/aibot-env';
import { getLogger } from '@/src/utils/logger';
import type { MultiQueryPayload, RetrievalResult, TextSearchPayload, BookInfo, RetrievalResultData, EnhancedRetrievalResult } from '@/src/core/aibot/types';

const logger = getLogger('aibot.retrieval');

const JSON_HEADERS = {
    'Content-Type': 'application/json'
};

const ensureTemplate = <T extends { plain_text_template?: string }>(payload: T): T => {
    if (payload.plain_text_template) {
        return payload;
    }
    return {
        ...payload,
        plain_text_template: DEFAULT_PLAIN_TEXT_TEMPLATE
    };
};

const ensureFormat = <T extends { response_format?: 'json' | 'plain_text' }>(payload: T): T => {
    if (payload.response_format) {
        return payload;
    }
    return {
        ...payload,
        response_format: 'plain_text'
    };
};

// 添加结构化响应解析函数
async function parseRetrievalResponse(
    response: Response,
    endpoint: string,
    payload: Record<string, unknown>
): Promise<RetrievalResultData> {
    try {
        // 尝试解析JSON响应
        const data = await response.clone().json();
        
        // 如果是plain_text格式，从context_plain_text解析
        if (data.context_plain_text) {
            return parsePlainTextToBooks(data.context_plain_text, payload, endpoint);
        }
        
        // 如果是JSON格式，直接解析results数组
        if (data.results && Array.isArray(data.results)) {
            return parseJsonResultsToBooks(data.results, payload, endpoint);
        }
        
        // 兜底处理
        return {
            books: [],
            totalCount: 0,
            searchQuery: payload.query as string || payload.markdown_text as string || '',
            searchType: endpoint.includes('text-search') ? 'text-search' : 'multi-query',
            metadata: data.metadata || {},
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        logger.error('解析检索响应失败', { error, endpoint });
        return {
            books: [],
            totalCount: 0,
            searchQuery: payload.query as string || payload.markdown_text as string || '',
            searchType: endpoint.includes('text-search') ? 'text-search' : 'multi-query',
            metadata: {},
            timestamp: new Date().toISOString()
        };
    }
}

// 解析纯文本格式为结构化数据
function parsePlainTextToBooks(
    plainText: string,
    payload: Record<string, unknown>,
    endpoint: string
): RetrievalResultData {
    // 按行分割文本
    const lines = plainText.split('\n').filter(line => line.trim());
    const books: BookInfo[] = [];
    
    lines.forEach((line, index) => {
        // 尝试解析格式：【书名】亮点 - 评分分
        const match = line.match(/^【(.+?)】(.+?)\s*-\s*([\d.]+)分$/);
        if (match) {
            books.push({
                id: `book-${index}`,
                title: match[1].trim(),
                author: '未知作者', // 纯文本格式可能没有作者信息
                highlights: [match[2].trim()],
                rating: parseFloat(match[3]),
                // 其他字段为空，因为纯文本格式信息有限
            });
        } else {
            // 其他格式的兜底处理
            books.push({
                id: `book-${index}`,
                title: line.trim(),
                author: '未知作者', // 纯文本格式可能没有作者信息
                description: line.trim()
            });
        }
    });
    
    return {
        books,
        totalCount: books.length,
        searchQuery: payload.query as string || payload.markdown_text as string || '',
        searchType: endpoint.includes('text-search') ? 'text-search' : 'multi-query',
        metadata: {},
        timestamp: new Date().toISOString()
    };
}

// 解析JSON格式为结构化数据
function parseJsonResultsToBooks(
    results: any[],
    payload: Record<string, unknown>,
    endpoint: string
): RetrievalResultData {
    const books: BookInfo[] = results.map((item, index) => ({
        id: item.id || `book-${index}`,
        title: item.title || item.豆瓣书名 || '',
        subtitle: item.subtitle || item.豆瓣副标题,
        author: item.author || item.豆瓣作者 || '',
        translator: item.translator || item.豆瓣译者,
        publisher: item.publisher,
        publishYear: item.publishYear || item.豆瓣出版年份,
        rating: item.rating || item.豆瓣评分,
        callNumber: item.callNumber || item.索书号,
        pageCount: item.pageCount || item.豆瓣页数,
        coverUrl: item.coverUrl,
        description: item.description || item.豆瓣内容简介,
        authorIntro: item.authorIntro || item.豆瓣作者简介,
        tableOfContents: item.tableOfContents || item.豆瓣目录,
        highlights: item.highlights,
        isbn: item.isbn,
        tags: item.tags
    }));
    
    return {
        books,
        totalCount: books.length,
        searchQuery: payload.query as string || payload.markdown_text as string || '',
        searchType: endpoint.includes('text-search') ? 'text-search' : 'multi-query',
        metadata: { results },
        timestamp: new Date().toISOString()
    };
}

async function postBookApi<T>(
    path: string,
    payload: Record<string, unknown>
): Promise<EnhancedRetrievalResult<T>> {
    const endpoint = `${getBookApiBase()}${path}`;
    logger.debug('请求图书检索 API', { endpoint, payloadKeys: Object.keys(payload) });

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        logger.error('图书检索 API 调用失败', { endpoint, status: response.status });
        throw new Error(`图书检索 API 返回 ${response.status}`);
    }

    // 首先克隆响应以避免多次消费
    const clonedResponse = response.clone();
    
    const contentType = response.headers.get('content-type') ?? '';
    let contextPlainText: string;
    let metadata: T = {} as T;

    if (contentType.includes('text/plain')) {
        contextPlainText = await response.text();
    } else {
        const data = await response.json();
        contextPlainText = data.context_plain_text ?? data.contextPlainText ?? '';
        metadata = (data.metadata ?? {}) as T;
    }

    if (!contextPlainText) {
        logger.error('API 响应缺少 context_plain_text', { endpoint });
        throw new Error('图书检索 API 响应异常：缺少 context_plain_text');
    }

    // 使用克隆的响应解析结构化数据
    const structuredData = await parseRetrievalResponse(clonedResponse, endpoint, payload);

    return {
        contextPlainText,
        metadata,
        structuredData
    };
}

/**
 * 包装 `/api/books/text-search`。
 */
export async function textSearch(payload: TextSearchPayload): Promise<EnhancedRetrievalResult> {
    const enriched = ensureTemplate(ensureFormat(payload));
    return postBookApi('/api/books/text-search', enriched as unknown as Record<string, unknown>);
}

/**
 * 包装 `/api/books/multi-query`。
 */
export async function multiQuery(payload: MultiQueryPayload): Promise<EnhancedRetrievalResult> {
    const enriched = ensureTemplate(ensureFormat(payload));
    return postBookApi('/api/books/multi-query', enriched as unknown as Record<string, unknown>);
}
