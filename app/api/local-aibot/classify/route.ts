import { NextResponse } from 'next/server';
import { assertAIBotEnabled, AIBotDisabledError } from '@/src/utils/aibot-env';
import { classifyUserIntent } from '@/src/core/aibot/classifier';
import { getLogger } from '@/src/utils/logger';
import type { ChatMessage } from '@/src/core/aibot/types';

const logger = getLogger('aibot.api.classify');

interface ClassifyRequest {
    userInput: string;
    messages?: ChatMessage[];
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
        const { userInput, messages = [] } = body as ClassifyRequest;

        if (!userInput?.trim()) {
            return NextResponse.json({ message: '缺少用户输入' }, { status: 400 });
        }

        logger.info('收到分类请求', {
            userInput: userInput.trim(),
            messagesCount: messages.length
        });

        // 调用分类器
        const classification = await classifyUserIntent({
            userInput: userInput.trim(),
            messages
        });

        logger.info('分类完成', {
            intent: classification.intent,
            confidence: classification.confidence,
            reason: classification.reason
        });

        return NextResponse.json(classification);

    } catch (error) {
        logger.error('分类失败', { error });
        return NextResponse.json(
            { message: '分类失败，请稍后重试' },
            { status: 500 }
        );
    }
}