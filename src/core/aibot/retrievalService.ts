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
        
        // 优先检查JSON格式的results数组，这是API的标准响应格式
        if (data.results && Array.isArray(data.results)) {
            return parseJsonResultsToBooks(data.results, payload, endpoint);
        }
        
        // 只有在没有results数组时，才尝试从context_plain_text解析（纯文本格式）
        if (data.context_plain_text && !data.results) {
            return parsePlainTextToBooks(data.context_plain_text, payload, endpoint);
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
    
    // 应用去重逻辑
    const deduplicatedBooks = deduplicateBooks(books);
    
    // 记录去重统计信息
    if (books.length !== deduplicatedBooks.length) {
        logger.info('纯文本格式图书去重完成', {
            originalCount: books.length,
            deduplicatedCount: deduplicatedBooks.length,
            removedCount: books.length - deduplicatedBooks.length,
            searchType: endpoint.includes('text-search') ? 'text-search' : 'multi-query'
        });
    }
    
    return {
        books: deduplicatedBooks,
        totalCount: deduplicatedBooks.length,
        searchQuery: payload.query as string || payload.markdown_text as string || '',
        searchType: endpoint.includes('text-search') ? 'text-search' : 'multi-query',
        metadata: { originalCount: books.length, deduplicatedCount: deduplicatedBooks.length },
        timestamp: new Date().toISOString()
    };
}

/**
 * 图书去重函数
 * 优先使用book_id或embedding_id作为唯一标识，如果没有则回退到书名+作者组合
 */
function deduplicateBooks(books: BookInfo[]): BookInfo[] {
    const bookMap = new Map<string, BookInfo>();
    
    books.forEach(book => {
        // 优先使用book_id作为去重键，其次是embedding_id，最后回退到书名+作者组合
        let dedupeKey: string;
        
        if (book.id && !book.id.startsWith('book-')) {
            // 如果有真实的book_id（不是自动生成的），使用book_id
            dedupeKey = `book_id:${book.id}`;
        } else if (book.embeddingId) {
            // 如果有embedding_id，使用embedding_id
            dedupeKey = `embedding:${book.embeddingId}`;
        } else {
            // 回退到书名+作者的组合
            dedupeKey = `title_author:${book.title.toLowerCase().trim()}-${book.author.toLowerCase().trim()}`;
        }
        
        const existingBook = bookMap.get(dedupeKey);
        
        if (!existingBook) {
            // 如果不存在，直接添加
            bookMap.set(dedupeKey, book);
        } else {
            // 如果已存在，比较并保留评分更高的版本
            const currentScore = book.finalScore || book.similarityScore || book.rating || 0;
            const existingScore = existingBook.finalScore || existingBook.similarityScore || existingBook.rating || 0;
            
            if (currentScore > existingScore) {
                bookMap.set(dedupeKey, book);
            }
        }
    });
    
    return Array.from(bookMap.values());
}

// 解析JSON格式为结构化数据
function parseJsonResultsToBooks(
    results: any[],
    payload: Record<string, unknown>,
    endpoint: string
): RetrievalResultData {
    const books: BookInfo[] = results.map((item, index) => ({
        id: item.book_id || item.id || `book-${index}`,
        title: item.title || item.豆瓣书名 || '',
        subtitle: item.subtitle || item.豆瓣副标题,
        author: item.author || item.豆瓣作者 || '',
        translator: item.translator || item.豆瓣译者,
        publisher: item.publisher,
        publishYear: item.publishYear || item.豆瓣出版年份,
        rating: item.rating || item.豆瓣评分,
        callNumber: item.call_no || item.callNumber || item.索书号,
        pageCount: item.pageCount || item.豆瓣页数,
        coverUrl: item.coverUrl,
        description: item.summary || item.description || item.豆瓣内容简介,
        authorIntro: item.authorIntro || item.豆瓣作者简介,
        tableOfContents: item.tableOfContents || item.豆瓣目录,
        highlights: item.highlights,
        isbn: item.isbn,
        tags: item.tags,
        // API返回的评分相关字段
        fusedScore: item.fused_score,
        similarityScore: item.similarity_score,
        rerankerScore: item.reranker_score,
        finalScore: item.final_score,
        // API返回的其他字段
        matchSource: item.match_source,
        embeddingId: item.embedding_id,
        sourceQueryType: item.source_query_type
    }));
    
    // 应用去重逻辑
    const deduplicatedBooks = deduplicateBooks(books);
    
    // 记录去重统计信息
    if (books.length !== deduplicatedBooks.length) {
        logger.info('图书去重完成', {
            originalCount: books.length,
            deduplicatedCount: deduplicatedBooks.length,
            removedCount: books.length - deduplicatedBooks.length,
            searchType: endpoint.includes('text-search') ? 'text-search' : 'multi-query'
        });
    }
    
    return {
        books: deduplicatedBooks,
        totalCount: deduplicatedBooks.length,
        searchQuery: payload.query as string || payload.markdown_text as string || '',
        searchType: endpoint.includes('text-search') ? 'text-search' : 'multi-query',
        metadata: { results, originalCount: results.length, deduplicatedCount: deduplicatedBooks.length },
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
    let contextPlainText: string = '';
    let metadata: T = {} as T;

    if (contentType.includes('text/plain')) {
        contextPlainText = await response.text();
    } else {
        const data = await response.json();
        contextPlainText = data.context_plain_text ?? data.contextPlainText ?? '';
        metadata = (data.metadata ?? {}) as T;
    }

    // 使用克隆的响应解析结构化数据
    const structuredData = await parseRetrievalResponse(clonedResponse, endpoint, payload);

    // 如果没有contextPlainText但有结构化数据，从结构化数据生成
    if (!contextPlainText && structuredData.books && structuredData.books.length > 0) {
        contextPlainText = structuredData.books
            .map(book => `【${book.title}】${book.highlights?.join('；') || book.description || ''} - ${book.rating || 0}分`)
            .join('\n');
        logger.info('从结构化数据生成 contextPlainText', { booksCount: structuredData.books.length });
    }

    // 如果仍然没有contextPlainText且没有结构化数据，才抛出错误
    if (!contextPlainText && (!structuredData.books || structuredData.books.length === 0)) {
        logger.error('API 响应既没有 context_plain_text 也没有有效的结构化数据', { endpoint });
        throw new Error('图书检索 API 响应异常：缺少有效数据');
    }

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

/**
 * 根据相似度阈值筛选图书
 */
export function filterBooksBySimilarity(
    books: BookInfo[],
    threshold: number = 0.42
): BookInfo[] {
    return books.filter(book => {
        const similarity = book.similarityScore || book.finalScore || 0;
        return similarity > threshold;
    });
}

/**
 * 根据图书ID筛选图书
 */
export function filterBooksByIds(
    books: BookInfo[],
    selectedIds: Set<string>
): BookInfo[] {
    return books.filter(book => selectedIds.has(book.id));
}

/**
 * 智能图书筛选：结合人工选择和相似度过滤
 */
export function intelligentBookFiltering(
    books: BookInfo[],
    selectedIds: Set<string>,
    similarityThreshold: number = 0.42,
    maxBooks: number = 8
): BookInfo[] {
    // 如果有手动选择，优先使用手动选择
    if (selectedIds.size > 0) {
        const selectedBooks = filterBooksByIds(books, selectedIds);
        
        // 如果选择数量过多，按相似度排序并限制数量
        if (selectedBooks.length > maxBooks) {
            return selectedBooks
                .sort((a, b) => (b.finalScore || b.similarityScore || 0) - (a.finalScore || a.similarityScore || 0))
                .slice(0, maxBooks);
        }
        
        return selectedBooks;
    }
    
    // 没有手动选择时，使用相似度过滤
    const filteredBooks = filterBooksBySimilarity(books, similarityThreshold);
    
    // 按相似度排序并限制数量
    return filteredBooks
        .sort((a, b) => (b.finalScore || b.similarityScore || 0) - (a.finalScore || a.similarityScore || 0))
        .slice(0, maxBooks);
}

/**
 * 为简单检索优化的文本搜索
 */
export async function simpleTextSearch(query: string): Promise<EnhancedRetrievalResult> {
    return textSearch({
        query,
        top_k: 10, // 简单检索返回更多结果供选择
        response_format: 'json',
        min_rating: 6.0 // 最低评分要求
    });
}

/**
 * 计算图书相关性分数（综合多个指标）
 */
export function calculateRelevanceScore(book: BookInfo): number {
    const similarity = book.similarityScore || 0;
    const final = book.finalScore || 0;
    const fused = book.fusedScore || 0;
    const rating = (book.rating || 0) / 10; // 归一化评分
    
    // 加权计算相关性分数
    return (similarity * 0.4) + (final * 0.3) + (fused * 0.2) + (rating * 0.1);
}

/**
 * 检索错误处理类
 */
export class RetrievalError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly details?: any
    ) {
        super(message);
        this.name = 'RetrievalError';
    }
}

/**
 * 处理检索错误
 */
export function handleRetrievalError(error: unknown): RetrievalError {
    if (error instanceof RetrievalError) {
        return error;
    }
    
    if (error instanceof Error) {
        if (error.message.includes('timeout')) {
            return new RetrievalError('检索超时', 'TIMEOUT', { originalError: error });
        }
        
        if (error.message.includes('network')) {
            return new RetrievalError('网络连接失败', 'NETWORK_ERROR', { originalError: error });
        }
        
        if (error.message.includes('404')) {
            return new RetrievalError('检索服务不可用', 'SERVICE_UNAVAILABLE', { originalError: error });
        }
    }
    
    return new RetrievalError('检索失败', 'UNKNOWN_ERROR', { originalError: error });
}
