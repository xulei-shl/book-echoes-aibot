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

        if (!retrieval.contextPlainText) {
            logger.error('检索结果为空', { query });
            return NextResponse.json({ 
                success: false,
                message: '未找到相关图书' 
            }, { status: 404 });
        }

        logger.info('检索成功', {
            query,
            booksCount: retrieval.structuredData?.books.length || 0,
            hasStructuredData: !!retrieval.structuredData
        });

        // 返回检索结果
        return NextResponse.json({
            success: true,
            query,
            retrievalResult: retrieval.structuredData,
            contextPlainText: retrieval.contextPlainText,
            metadata: retrieval.metadata
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