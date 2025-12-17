import { NextResponse } from 'next/server';
import { streamText, convertToCoreMessages, type Message } from 'ai';
import { assertAIBotEnabled, AIBotDisabledError } from '@/src/utils/aibot-env';
import { getLogger } from '@/src/utils/logger';
import { buildChatWorkflowContext, createModel } from '@/src/core/aibot/researchWorkflow';
import { AIBOT_MODES } from '@/src/core/aibot/constants';
import type { ChatMessage } from '@/src/core/aibot/types';

const logger = getLogger('aibot.api.chat');
const ALLOWED_MODES = new Set<string>(Object.values(AIBOT_MODES));

const toChatMessages = (messages: Message[]): ChatMessage[] =>
    messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content
    }));

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
        const mode = typeof body?.mode === 'string' ? body.mode : AIBOT_MODES.TEXT;
        if (!ALLOWED_MODES.has(mode)) {
            return NextResponse.json({ message: 'mode 参数非法' }, { status: 400 });
        }

        const messages: Message[] = Array.isArray(body?.messages) ? body.messages : [];
        const workflowContext = await buildChatWorkflowContext({
            mode,
            messages: toChatMessages(messages),
            draftMarkdown: typeof body?.draft_markdown === 'string' ? body.draft_markdown : undefined,
            deepMetadata: body?.deep_metadata
        });

        const result = await streamText({
            model: createModel(workflowContext.llmConfig),
            system: workflowContext.systemPrompt,
            messages: convertToCoreMessages(messages)
        });

        return result.toTextStreamResponse({
            headers: {
                'X-AIBot-Mode': workflowContext.mode
            }
        });
    } catch (error) {
        logger.error('AIBot 对话失败', { error });
        return NextResponse.json({ message: '对话失败，请稍后重试' }, { status: 500 });
    }
}
