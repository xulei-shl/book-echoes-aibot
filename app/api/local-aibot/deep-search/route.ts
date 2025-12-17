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

        if (!retrieval.contextPlainText) {
            logger.error('图书检索结果为空');
            throw new Error('图书检索返回空结果');
        }

        logger.info('图书检索完成', { 
            bookCount: retrieval.structuredData?.books?.length || 0,
            hasStructuredData: !!retrieval.structuredData
        });

        return NextResponse.json({
            success: true,
            draftMarkdown,
            retrievalResult: retrieval.structuredData,
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