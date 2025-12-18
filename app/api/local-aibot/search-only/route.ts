import { NextResponse } from 'next/server';
import { assertAIBotEnabled, AIBotDisabledError } from '@/src/utils/aibot-env';
import { getLogger } from '@/src/utils/logger';
import { classifyUserIntent } from '@/src/core/aibot/classifier';
import { simpleTextSearch, handleRetrievalError } from '@/src/core/aibot/retrievalService';
import type { ChatMessage, IntentClassificationResult, SearchOnlyRequest } from '@/src/core/aibot/types';

const logger = getLogger('aibot.api.search-only');

export async function POST(request: Request) {
    try {
        assertAIBotEnabled();
    } catch (error) {
        if (error instanceof AIBotDisabledError) {
            return NextResponse.json({ message: 'Not Found' }, { status: 404 });
        }
        throw error;
    }

    try {
        const payload = (await request.json()) as SearchOnlyRequest;
        const { query, messages = [] } = payload;

        if (!query?.trim()) {
            return NextResponse.json({ 
                success: false,
                message: '缺少查询内容' 
            }, { status: 400 });
        }

        logger.info('执行检索', { query, messagesCount: messages.length });

        // 执行检索
        const retrieval = await simpleTextSearch(query.trim());

        logger.info('检索完成', {
            query,
            hasContextPlainText: !!retrieval.contextPlainText,
            contextPlainTextLength: retrieval.contextPlainText?.length || 0,
            hasStructuredData: !!retrieval.structuredData,
            booksCount: retrieval.structuredData?.books?.length || 0
        });

        // 即使没有找到图书，也返回成功，让前端显示"未找到相关图书"的提示
        // 只有在完全没有上下文文本时才认为是错误
        if (!retrieval.contextPlainText && (!retrieval.structuredData || !retrieval.structuredData.books || retrieval.structuredData.books.length === 0)) {
            logger.error('检索结果完全为空', { query });
            return NextResponse.json({
                success: false,
                message: '检索失败，请稍后重试'
            }, { status: 500 });
        }

        // 返回检索结果
        return NextResponse.json({
            success: true,
            query,
            retrievalResult: retrieval.structuredData || { books: [], totalCount: 0, searchQuery: query, searchType: 'text-search', metadata: {}, timestamp: new Date().toISOString() },
            contextPlainText: retrieval.contextPlainText || '',
            metadata: retrieval.metadata || {}
        });

    } catch (error) {
        const retrievalError = handleRetrievalError(error);
        logger.error('检索失败', { error: retrievalError, details: retrievalError.details });
        
        return NextResponse.json({ 
            success: false,
            message: retrievalError.message,
            code: retrievalError.code
        }, { status: 500 });
    }
}