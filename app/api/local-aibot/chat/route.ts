import { NextResponse } from 'next/server';
import { streamText, type CoreMessage } from 'ai';
import { assertAIBotEnabled, AIBotDisabledError } from '@/src/utils/aibot-env';
import { getLogger } from '@/src/utils/logger';
import { buildChatWorkflowContext, createModel } from '@/src/core/aibot/researchWorkflow';
import { classifyUserIntent, hasPromptInjectionRisk, shouldBypassClassifier } from '@/src/core/aibot/classifier';
import { AIBOT_INTENTS, AIBOT_MODES, type AIBotMode } from '@/src/core/aibot/constants';
import type { ChatMessage, IntentClassificationResult } from '@/src/core/aibot/types';

const logger = getLogger('aibot.api.chat');
const ALLOWED_MODES = new Set<string>(Object.values(AIBOT_MODES));
const DEFAULT_OTHER_REPLY = [
    '你好，我是 Book Echoes 图书智搜助手，专注解读与推荐书籍内容。',
    '当前输入暂未匹配到图书检索任务。试着告诉我：你想解决的问题、关注的主题、阅读目标或领域关键词，我就能为你找到书。'
].join('\n');

interface ChatRequestPayload {
    mode?: string;
    messages?: CoreMessage[];
    draft_markdown?: string;
    deep_metadata?: {
        draftMarkdown?: string;
        [key: string]: unknown;
    } & Record<string, unknown>;
    [key: string]: unknown;
}

const toChatMessages = (messages: CoreMessage[]): ChatMessage[] => {
    if (!Array.isArray(messages)) {
        logger.info('messages 不是数组', { messages, type: typeof messages });
        return [];
    }
    
    return messages.map((message, index) => {
        logger.debug(`处理消息 ${index}`, {
            role: message.role,
            contentType: typeof message.content,
            contentIsArray: Array.isArray(message.content),
            content: message.content
        });
        
        // 处理不同类型的content
        let content: string;
        if (typeof message.content === 'string') {
            content = message.content;
        } else if (Array.isArray(message.content)) {
            try {
                content = message.content
                    .filter(part => part && typeof part === 'object' && part.type === 'text')
                    .map(part => {
                        if (part && typeof part === 'object' && 'text' in part) {
                            return String(part.text || '');
                        }
                        return '';
                    })
                    .join('');
            } catch (error) {
                logger.error('处理消息内容时出错', { error, message, index });
                content = '';
            }
        } else {
            content = String(message.content || '');
        }
        
        const result = {
            role: message.role,
            content
        };
        
        logger.debug(`转换后的消息 ${index}`, { result });
        return result;
    });
};

const hasDeepPayload = (body: ChatRequestPayload): boolean => {
    const draft = typeof body?.draft_markdown === 'string' ? body.draft_markdown.trim() : '';
    if (draft) {
        return true;
    }
    const metaDraft = typeof body?.deep_metadata?.draftMarkdown === 'string'
        ? body.deep_metadata.draftMarkdown.trim()
        : '';
    return !!metaDraft;
};

const getLatestUserMessage = (messages: ChatMessage[]): string => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i];
        if (message.role === 'user' && message.content.trim()) {
            return message.content;
        }
    }
    return '';
};

const buildOtherReply = (classification: IntentClassificationResult): string => {
    if (classification.suggestedQuery?.trim()) {
        return `${DEFAULT_OTHER_REPLY}\n你可以尝试这样问：${classification.suggestedQuery.trim()}`;
    }
    return DEFAULT_OTHER_REPLY;
};

const determineMode = (
    intent: IntentClassificationResult['intent'],
    requestedMode: AIBotMode,
    body: ChatRequestPayload
): { mode: AIBotMode; downgraded: boolean } => {
    if (intent === AIBOT_INTENTS.DEEP_SEARCH && hasDeepPayload(body)) {
        return { mode: AIBOT_MODES.DEEP, downgraded: false };
    }
    if (intent === AIBOT_INTENTS.DEEP_SEARCH && !hasDeepPayload(body)) {
        return { mode: AIBOT_MODES.TEXT, downgraded: true };
    }
    return { mode: AIBOT_MODES.TEXT, downgraded: requestedMode === AIBOT_MODES.DEEP };
};

const streamHeaders = (
    classification: IntentClassificationResult,
    mode: AIBotMode
): Record<string, string> => ({
    'X-AIBot-Mode': mode,
    'X-AIBot-Intent': classification.intent,
    'X-AIBot-Intent-Confidence': classification.confidence.toFixed(2)
});

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
        const payload = (await request.json()) as ChatRequestPayload;
        logger.info('收到请求载荷', {
            payload,
            hasMessages: Array.isArray(payload?.messages),
            messagesCount: Array.isArray(payload?.messages) ? payload.messages.length : 0
        });
        
        const mode = typeof payload?.mode === 'string' ? payload.mode : AIBOT_MODES.TEXT;
        if (!ALLOWED_MODES.has(mode)) {
            return NextResponse.json({ message: 'mode 参数非法' }, { status: 400 });
        }

        const messages: CoreMessage[] = Array.isArray(payload?.messages) ? payload.messages : [];
        logger.info('原始消息详情', {
            messages,
            messagesType: typeof messages,
            messagesLength: messages?.length,
            messageDetails: messages.map((msg, idx) => ({
                index: idx,
                role: msg.role,
                contentLength: typeof msg.content === 'string' ? msg.content.length : 'complex',
                contentPreview: typeof msg.content === 'string' ? msg.content.slice(0, 50) : 'complex content'
            }))
        });
        
        const chatMessages = toChatMessages(messages);
        logger.info('转换后的聊天消息', { chatMessages });
        const latestUserMessage = getLatestUserMessage(chatMessages);
        if (!latestUserMessage) {
            return NextResponse.json({ message: '缺少用户输入' }, { status: 400 });
        }

        const previousMode = mode as AIBotMode;
        const bypassClassifier = shouldBypassClassifier(latestUserMessage, previousMode);
        let classification: IntentClassificationResult;
        if (bypassClassifier) {
            classification = {
                intent: previousMode === AIBOT_MODES.DEEP ? AIBOT_INTENTS.DEEP_SEARCH : AIBOT_INTENTS.SIMPLE_SEARCH,
                confidence: 0.85,
                reason: '命中延续关键词，沿用上一轮意图',
                source: 'rule'
            };
        } else {
            classification = await classifyUserIntent({
                userInput: latestUserMessage,
                messages: chatMessages
            });
        }

        if (classification.intent === AIBOT_INTENTS.OTHER || hasPromptInjectionRisk(latestUserMessage)) {
            const reply = buildOtherReply(classification);
            return new Response(reply, {
                headers: streamHeaders(classification, AIBOT_MODES.TEXT),
                status: 200
            });
        }

        const { mode: resolvedMode, downgraded } = determineMode(classification.intent, previousMode, payload);
        if (downgraded) {
            logger.info('分类器降级到普通检索模式', {
                requestedMode: previousMode,
                intent: classification.intent
            });
        }

        const workflowContext = await buildChatWorkflowContext({
            mode: resolvedMode,
            messages: chatMessages,
            draftMarkdown: typeof payload?.draft_markdown === 'string' ? payload.draft_markdown : undefined,
            deepMetadata: payload?.deep_metadata as any
        });
        logger.info('工作流上下文构建完成', {
            hasSystemPrompt: !!workflowContext.systemPrompt,
            llmConfig: workflowContext.llmConfig,
            hasDraftMarkdown: !!payload?.draft_markdown,
            hasDeepMetadata: !!payload?.deep_metadata,
            deepMetadataKeys: payload?.deep_metadata ? Object.keys(payload.deep_metadata) : []
        });
        logger.info('工作流上下文构建完成', {
            hasSystemPrompt: !!workflowContext.systemPrompt,
            llmConfig: workflowContext.llmConfig
        });

        logger.info('准备调用 streamText', {
            messagesForConversion: messages,
            messagesType: typeof messages,
            isArray: Array.isArray(messages)
        });
        
        // 记录 LLM 配置信息
        logger.info('准备调用 streamText', {
            llmConfig: workflowContext.llmConfig,
            modelConfig: {
                model: workflowContext.llmConfig.model,
                baseURL: workflowContext.llmConfig.baseURL,
                hasApiKey: !!workflowContext.llmConfig.apiKey
            }
        });
        
        const result = streamText({
            model: createModel(workflowContext.llmConfig),
            system: workflowContext.systemPrompt,
            messages: chatMessages as any
        });

        return result.toTextStreamResponse({
            headers: streamHeaders(classification, workflowContext.mode)
        });
    } catch (error) {
        logger.error('AIBot 对话失败', { error });
        return NextResponse.json({ message: '对话失败，请稍后重试' }, { status: 500 });
    }
}
