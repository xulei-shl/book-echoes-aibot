import { NextResponse } from 'next/server';
import { assertAIBotEnabled, AIBotDisabledError } from '@/src/utils/aibot-env';
import { getLogger } from '@/src/utils/logger';
import { multiQuery } from '@/src/core/aibot/retrievalService';
import type { BookInfo } from '@/src/core/aibot/types';

const logger = getLogger('aibot.api.deep-search');

interface DeepSearchRequest {
    draftMarkdown: string;  // 交叉分析生成的草稿
    userInput: string;
}

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
        const body = await request.json();
        const { draftMarkdown, userInput } = body as DeepSearchRequest;

        if (!draftMarkdown || typeof draftMarkdown !== 'string') {
            return NextResponse.json({ message: 'draftMarkdown 不能为空' }, { status: 400 });
        }

        if (!userInput || typeof userInput !== 'string') {
            return NextResponse.json({ message: 'userInput 不能为空' }, { status: 400 });
        }

        logger.info('开始图书检索流程', { 
            draftLength: draftMarkdown.length,
            userInput 
        });

        // 基于草稿进行图书检索
        const retrieval = await multiQuery({
            markdown_text: draftMarkdown,
            per_query_top_k: 8,
            final_top_k: 12,
            enable_rerank: true
        });

        console.log('检索结果:', JSON.stringify(retrieval, null, 2)); // 添加调试日志

        logger.info('图书检索完成', {
            hasContextPlainText: !!retrieval.contextPlainText,
            contextPlainTextLength: retrieval.contextPlainText?.length || 0,
            hasStructuredData: !!retrieval.structuredData,
            bookCount: retrieval.structuredData?.books?.length || 0
        });

        console.log('返回给前端的图书数据:', retrieval.structuredData?.books); // 添加调试日志

        // 即使没有找到图书，也返回成功，让前端显示"未找到相关图书"的提示
        // 只有在完全没有上下文文本时才认为是错误
        if (!retrieval.contextPlainText && (!retrieval.structuredData || !retrieval.structuredData.books || retrieval.structuredData.books.length === 0)) {
            logger.error('图书检索结果完全为空');
            throw new Error('图书检索返回空结果');
        }

        return NextResponse.json({
            success: true,
            draftMarkdown,
            retrievalResult: retrieval.structuredData || { books: [], totalCount: 0, searchQuery: userInput, searchType: 'multi-query', metadata: {}, timestamp: new Date().toISOString() },
            userInput
        });

    } catch (error) {
        logger.error('图书检索失败', { error });
        return NextResponse.json({ 
            message: '图书检索失败，请稍后重试',
            success: false
        }, { status: 500 });
    }
}