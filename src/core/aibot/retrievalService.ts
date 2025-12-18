import { DEFAULT_PLAIN_TEXT_TEMPLATE } from '@/src/utils/aibot-env';
import { getBookApiBase } from '@/src/utils/aibot-env';
import { getLogger } from '@/src/utils/logger';
import type { MultiQueryPayload, RetrievalResult, TextSearchPayload, BookInfo, RetrievalResultData, EnhancedRetrievalResult, ExpandedSearchResult, ParallelSearchResult, QueryExpansionResult } from '@/src/core/aibot/types';
import { expandQuery, extractSearchTexts } from './queryExpansionService';

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
        response_format: 'json'  // 修改默认值为json，确保获取结构化数据
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
        
        logger.info('API响应数据结构', {
            hasResults: !!data.results,
            resultsType: Array.isArray(data.results) ? 'array' : typeof data.results,
            resultsLength: Array.isArray(data.results) ? data.results.length : 'N/A',
            hasContextPlainText: !!data.context_plain_text,
            hasMetadata: !!data.metadata,
            allKeys: Object.keys(data),
            endpoint,
            // 添加更详细的响应数据用于调试
            responseDataSample: {
                results: data.results ? (Array.isArray(data.results) ? `array[${data.results.length}]` : typeof data.results) : 'undefined',
                context_plain_text: data.context_plain_text ? `string[${data.context_plain_text.length}]` : 'undefined',
                metadata: data.metadata ? `object[${Object.keys(data.metadata).length}keys]` : 'undefined'
            }
        });
        
        // 优先检查JSON格式的results数组，这是API的标准响应格式
        if (data.results && Array.isArray(data.results)) {
            logger.info('使用JSON格式解析', { resultsCount: data.results.length });
            return parseJsonResultsToBooks(data.results, payload, endpoint);
        }
        
        // 只有在没有results数组时，才尝试从context_plain_text解析（纯文本格式）
        if (data.context_plain_text && !data.results) {
            logger.info('使用纯文本格式解析');
            return parsePlainTextToBooks(data.context_plain_text, payload, endpoint);
        }
        
        // 兜底处理 - 记录详细的响应结构以便调试
        logger.error('API响应中未找到预期的数据结构', {
            responseKeys: Object.keys(data),
            endpoint,
            payload,
            hasResults: !!data.results,
            hasContextPlainText: !!data.context_plain_text,
            resultsType: typeof data.results,
            contextPlainTextLength: data.context_plain_text?.length || 0
        });
        
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
    logger.info('解析纯文本格式', {
        textLength: plainText.length,
        endpoint
    });
    
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
    
    logger.info('纯文本解析结果', {
        linesCount: lines.length,
        booksParsed: books.length,
        sampleBooks: books.slice(0, 2).map(b => ({
            id: b.id,
            title: b.title,
            author: b.author,
            hasRating: !!b.rating
        }))
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
    logger.info('开始图书去重', {
        originalCount: books.length,
        sampleBooks: books.slice(0, 3).map(b => ({
            id: b.id,
            title: b.title,
            author: b.author,
            hasEmbeddingId: !!b.embeddingId
        }))
    });
    
    const bookMap = new Map<string, BookInfo>();
    let duplicateCount = 0;
    
    books.forEach(book => {
        // 优先使用book_id作为去重键，其次是embedding_id，最后回退到书名+作者组合
        let dedupeKey: string;
        const normalizedBookId = typeof book.id === 'string'
            ? book.id
            : (book.id !== undefined && book.id !== null ? String(book.id) : '');
        
        if (normalizedBookId && !normalizedBookId.startsWith('book-')) {
            // 如果有真实的book_id（不是自动生成的），使用book_id
            dedupeKey = `book_id:${normalizedBookId}`;
        } else if (book.embeddingId) {
            // 如果有embedding_id，使用embedding_id
            dedupeKey = `embedding:${book.embeddingId}`;
        } else {
            // 回退到书名+作者的组合
            const safeTitle = (book.title || '').toLowerCase().trim();
            const safeAuthor = (book.author || '').toLowerCase().trim();
            dedupeKey = `title_author:${safeTitle}-${safeAuthor}`;
        }
        
        const existingBook = bookMap.get(dedupeKey);
        
        if (!existingBook) {
            // 如果不存在，直接添加
            bookMap.set(dedupeKey, book);
        } else {
            // 如果已存在，比较并保留评分更高的版本
            duplicateCount++;
            const currentScore = book.finalScore || book.similarityScore || book.rating || 0;
            const existingScore = existingBook.finalScore || existingBook.similarityScore || existingBook.rating || 0;
            
            if (currentScore > existingScore) {
                bookMap.set(dedupeKey, book);
                logger.debug('替换重复图书', {
                    dedupeKey,
                    oldScore: existingScore,
                    newScore: currentScore,
                    title: book.title
                });
            } else {
                logger.debug('保留现有重复图书', {
                    dedupeKey,
                    existingScore,
                    currentScore,
                    title: existingBook.title
                });
            }
        }
    });
    
    const result = Array.from(bookMap.values());
    
    logger.info('图书去重完成', {
        originalCount: books.length,
        deduplicatedCount: result.length,
        duplicateCount,
        sampleDeduplicatedBooks: result.slice(0, 3).map(b => ({
            id: b.id,
            title: b.title,
            author: b.author
        }))
    });
    
    return result;
}

// 解析JSON格式为结构化数据
function parseJsonResultsToBooks(
    results: any[],
    payload: Record<string, unknown>,
    endpoint: string
): RetrievalResultData {
    logger.info('解析JSON结果', {
        inputCount: results.length,
        sampleData: results.slice(0, 2).map(item => ({
            title: item.title,
            author: item.author,
            book_id: item.book_id,
            similarity_score: item.similarity_score
        }))
    });
    
    // 检查结果是否为空
    if (!results || results.length === 0) {
        logger.info('API返回的results数组为空', { endpoint });
        return {
            books: [],
            totalCount: 0,
            searchQuery: payload.query as string || payload.markdown_text as string || '',
            searchType: endpoint.includes('text-search') ? 'text-search' : 'multi-query',
            metadata: { originalCount: 0, deduplicatedCount: 0 },
            timestamp: new Date().toISOString()
        };
    }
    
    const books: BookInfo[] = results.map((item, index) => {
        const rawId = item.book_id ?? item.id;
        const normalizedId = rawId !== undefined && rawId !== null && `${rawId}`.trim() !== ''
            ? String(rawId)
            : `book-${index}`;

        // 确保每个结果都有基本字段
        const book: BookInfo = {
            id: normalizedId,
            title: item.title || item.豆瓣书名 || `未知书名-${index}`,
            author: item.author || item.豆瓣作者 || '未知作者',
            // 其他字段为可选
            subtitle: item.subtitle || item.豆瓣副标题,
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
        };
        
        return book;
    });
    
    logger.info('映射后的图书信息', {
        mappedCount: books.length,
        sampleBooks: books.slice(0, 2).map(b => ({
            id: b.id,
            title: b.title,
            author: b.author,
            hasDescription: !!b.description
        }))
    });
    
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
    logger.info('请求图书检索 API', {
        endpoint,
        payloadKeys: Object.keys(payload),
        responseFormat: (payload as any).response_format,
        query: (payload as any).query
    });

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
    let responseData: any = null;

    if (contentType.includes('text/plain')) {
        contextPlainText = await response.text();
        logger.info('接收到纯文本响应', { textLength: contextPlainText.length });
    } else {
        responseData = await response.json();
        logger.info('接收到JSON响应', {
            hasResults: !!responseData.results,
            resultsCount: Array.isArray(responseData.results) ? responseData.results.length : 'N/A',
            hasContextPlainText: !!responseData.context_plain_text,
            hasMetadata: !!responseData.metadata,
            allKeys: Object.keys(responseData)
        });
        
        contextPlainText = responseData.context_plain_text ?? responseData.contextPlainText ?? '';
        metadata = (responseData.metadata ?? {}) as T;
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

    // 如果仍然没有contextPlainText且没有结构化数据，记录详细错误信息
    if (!contextPlainText && (!structuredData.books || structuredData.books.length === 0)) {
        logger.error('API 响应既没有 context_plain_text 也没有有效的结构化数据', {
            endpoint,
            payload,
            responseData: responseData ? {
                keys: Object.keys(responseData),
                hasResults: !!responseData.results,
                resultsType: Array.isArray(responseData.results) ? 'array' : typeof responseData.results,
                resultsLength: Array.isArray(responseData.results) ? responseData.results.length : 'N/A',
                hasContextPlainText: !!responseData.context_plain_text,
                contextPlainTextLength: responseData.context_plain_text?.length || 0,
                hasMetadata: !!responseData.metadata
            } : '无响应数据',
            hasStructuredData: !!structuredData,
            booksCount: structuredData.books?.length || 0
        });
        // 不抛出错误，而是返回空结果，让前端能够显示"未找到相关图书"的提示
        logger.info('返回空结果而不是抛出错误，允许前端显示未找到图书的提示');
    }

    logger.info('API请求成功完成', {
        hasContextPlainText: !!contextPlainText,
        contextPlainTextLength: contextPlainText.length,
        hasStructuredData: !!structuredData,
        booksCount: structuredData.books?.length || 0
    });

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
    // 确保使用json格式获取结构化数据
    const enriched = ensureTemplate({
        ...payload,
        response_format: 'json'  // 强制使用json格式
    });
    logger.debug('发送文本搜索请求', {
        query: enriched.query,
        top_k: enriched.top_k,
        response_format: enriched.response_format,
        min_rating: enriched.min_rating
    });
    return postBookApi('/api/books/text-search', enriched as unknown as Record<string, unknown>);
}

/**
 * 包装 `/api/books/multi-query`。
 */
export async function multiQuery(payload: MultiQueryPayload): Promise<EnhancedRetrievalResult> {
    // 确保使用json格式获取结构化数据
    const enriched = ensureTemplate({
        ...payload,
        response_format: 'json'  // 强制使用json格式
    });
    logger.info('发送多查询请求', {
        markdownLength: enriched.markdown_text?.length || 0,
        perQueryTopK: enriched.per_query_top_k,
        finalTopK: enriched.final_top_k,
        responseFormat: enriched.response_format,
        enableRerank: enriched.enable_rerank
    });
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
    logger.info('执行简单文本搜索', { query });
    const result = await textSearch({
        query,
        top_k: 10, // 简单检索返回更多结果供选择
        response_format: 'json', // 修改为json格式，确保获取结构化数据
        min_rating: 6.0 // 最低评分要求
    });
    
    logger.info('简单文本搜索完成', {
        query,
        hasContextPlainText: !!result.contextPlainText,
        hasStructuredData: !!result.structuredData,
        booksCount: result.structuredData?.books?.length || 0,
        // 添加更详细的调试信息
        structuredDataKeys: result.structuredData ? Object.keys(result.structuredData) : [],
        contextPlainTextLength: result.contextPlainText?.length || 0
    });
    
    return result;
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

// ========== 查询扩展检索功能 ==========

/**
 * 执行单个检索查询
 */
async function executeSingleSearch(query: string): Promise<ParallelSearchResult> {
    const startTime = Date.now();

    try {
        const result = await textSearch({
            query,
            top_k: 10,
            response_format: 'json',
            min_rating: 6.0
        });

        const duration = Date.now() - startTime;
        const books = result.structuredData?.books || [];

        logger.debug('单个检索完成', {
            query: query.substring(0, 50),
            booksCount: books.length,
            duration
        });

        return {
            query,
            books,
            success: true,
            duration
        };
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('单个检索失败', { query: query.substring(0, 50), error, duration });

        return {
            query,
            books: [],
            success: false,
            error: error instanceof Error ? error.message : '检索失败',
            duration
        };
    }
}

/**
 * 并行执行多个检索查询
 */
async function executeParallelSearches(queries: string[]): Promise<ParallelSearchResult[]> {
    logger.info('开始并行检索', { queriesCount: queries.length });

    const results = await Promise.all(
        queries.map(query => executeSingleSearch(query))
    );

    const successCount = results.filter(r => r.success).length;
    logger.info('并行检索完成', {
        total: queries.length,
        success: successCount,
        failed: queries.length - successCount
    });

    return results;
}

/**
 * 合并并去重多个检索结果中的图书
 * 使用 book_id 或 embedding_id 作为主键，书名+作者作为备选
 */
function mergeAndDeduplicateBooks(parallelResults: ParallelSearchResult[]): BookInfo[] {
    const bookMap = new Map<string, BookInfo>();

    parallelResults.forEach(result => {
        if (!result.success) return;

        result.books.forEach(book => {
            // 生成去重键
            const normalizedBookId = typeof book.id === 'string'
                ? book.id
                : (book.id !== undefined && book.id !== null ? String(book.id) : '');

            let dedupeKey: string;
            if (normalizedBookId && !normalizedBookId.startsWith('book-')) {
                dedupeKey = `book_id:${normalizedBookId}`;
            } else if (book.embeddingId) {
                dedupeKey = `embedding:${book.embeddingId}`;
            } else {
                const safeTitle = (book.title || '').toLowerCase().trim();
                const safeAuthor = (book.author || '').toLowerCase().trim();
                dedupeKey = `title_author:${safeTitle}-${safeAuthor}`;
            }

            const existingBook = bookMap.get(dedupeKey);

            if (!existingBook) {
                bookMap.set(dedupeKey, book);
            } else {
                // 保留评分更高的版本
                const currentScore = book.finalScore || book.similarityScore || book.rating || 0;
                const existingScore = existingBook.finalScore || existingBook.similarityScore || existingBook.rating || 0;

                if (currentScore > existingScore) {
                    bookMap.set(dedupeKey, book);
                }
            }
        });
    });

    // 按评分排序
    const mergedBooks = Array.from(bookMap.values())
        .sort((a, b) => {
            const scoreA = a.finalScore || a.similarityScore || a.rating || 0;
            const scoreB = b.finalScore || b.similarityScore || b.rating || 0;
            return scoreB - scoreA;
        });

    logger.info('图书合并去重完成', {
        inputResults: parallelResults.length,
        totalBooks: parallelResults.reduce((sum, r) => sum + r.books.length, 0),
        mergedBooks: mergedBooks.length
    });

    return mergedBooks;
}

/**
 * 扩展检索：先进行查询扩展，再并行检索，最后合并去重
 */
export async function expandedSearch(query: string): Promise<ExpandedSearchResult> {
    const startTime = Date.now();

    logger.info('开始扩展检索', { query });

    // 1. 执行查询扩展
    const expansion = await expandQuery(query);

    // 2. 提取所有检索文本
    const searchTexts = extractSearchTexts(expansion);

    logger.info('查询扩展完成', {
        originalQuery: query,
        expandedCount: expansion.expandedProbes.length,
        totalSearchTexts: searchTexts.length,
        expansionDuration: expansion.duration
    });

    // 3. 并行执行检索
    const parallelResults = await executeParallelSearches(searchTexts);

    // 4. 合并去重
    const mergedBooks = mergeAndDeduplicateBooks(parallelResults);

    const totalDuration = Date.now() - startTime;

    // 5. 判断整体是否成功（至少有一个检索成功且有结果）
    const anySuccess = parallelResults.some(r => r.success && r.books.length > 0);

    logger.info('扩展检索完成', {
        query,
        totalDuration,
        parallelResultsCount: parallelResults.length,
        mergedBooksCount: mergedBooks.length,
        success: anySuccess
    });

    return {
        originalQuery: query,
        expansion,
        parallelResults,
        mergedBooks,
        totalDuration,
        success: anySuccess
    };
}

/**
 * 为简单检索优化的扩展文本搜索
 * 这是对外暴露的主要接口，替代原来的 simpleTextSearch
 */
export async function expandedSimpleSearch(query: string): Promise<EnhancedRetrievalResult> {
    logger.info('执行扩展简单文本搜索', { query });

    const expandedResult = await expandedSearch(query);

    // 构建contextPlainText
    const contextPlainText = expandedResult.mergedBooks
        .map(book => `【${book.title}】${book.highlights?.join('；') || book.description || ''} - ${book.rating || 0}分`)
        .join('\n');

    // 构建结构化数据
    const structuredData: RetrievalResultData = {
        books: expandedResult.mergedBooks,
        totalCount: expandedResult.mergedBooks.length,
        searchQuery: query,
        searchType: 'text-search',
        metadata: {
            expansionSuccess: expandedResult.expansion.success,
            expandedProbesCount: expandedResult.expansion.expandedProbes.length,
            parallelSearchCount: expandedResult.parallelResults.length,
            totalDuration: expandedResult.totalDuration
        },
        timestamp: new Date().toISOString()
    };

    logger.info('扩展简单文本搜索完成', {
        query,
        hasContextPlainText: !!contextPlainText,
        booksCount: structuredData.books.length,
        totalDuration: expandedResult.totalDuration
    });

    return {
        contextPlainText,
        metadata: structuredData.metadata as Record<string, unknown>,
        structuredData
    };
}
