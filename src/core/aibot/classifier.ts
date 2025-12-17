import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { AIBOT_INTENTS, AIBOT_MODES, AIBOT_PROMPT_FILES, type AIBotMode } from '@/src/core/aibot/constants';
import { loadPrompt } from '@/src/core/aibot/promptLoader';
import type { IntentClassifierInput, IntentClassificationResult } from '@/src/core/aibot/types';
import { resolveLLMConfig } from '@/src/utils/aibot-env';
import { getLogger } from '@/src/utils/logger';

const logger = getLogger('aibot.classifier');

const CONTINUE_KEYWORDS = ['继续', '下一步', '接着', '继续执行', 'go on', 'next', 'proceed', '确认执行'];
const QUICK_ACK_KEYWORDS = ['继续', 'ok', '收到'];
const PROMPT_INJECTION_PATTERNS = [
    /ignore\s+previous/i,
    /forget\s+instructions?/i,
    /system\s+prompt/i,
    /jailbreak/i,
    /越狱/,
    /提示词/,
    /注入/,
    /指令/,
    /act\s+as/i
];
const MAX_CONTEXT_MESSAGES = 6;

const FALLBACK_RESULT: IntentClassificationResult = {
    intent: AIBOT_INTENTS.SIMPLE_SEARCH,
    confidence: 0.5,
    reason: 'LLM 分类失败，回落到默认检索',
    source: 'rule'
};

const normalizeIntent = (value?: string): IntentClassificationResult['intent'] => {
    switch (value) {
        case AIBOT_INTENTS.DEEP_SEARCH:
            return AIBOT_INTENTS.DEEP_SEARCH;
        case AIBOT_INTENTS.OTHER:
            return AIBOT_INTENTS.OTHER;
        default:
            return AIBOT_INTENTS.SIMPLE_SEARCH;
    }
};

const clampConfidence = (value?: number): number => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return 0.5;
    }
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
};

const summarizeMessages = (messages: IntentClassifierInput['messages']): string => {
    if (!messages?.length) {
        return '';
    }
    const selected = messages.slice(-MAX_CONTEXT_MESSAGES);
    return selected
        .map((message) => {
            const normalized = message.content.replace(/\s+/g, ' ').trim().slice(0, 280);
            return `[${message.role}] ${normalized}`;
        })
        .join('\n');
};

const buildClassifierPrompt = (input: IntentClassifierInput): string => {
    const sections: string[] = [
        '# 当前用户输入',
        input.userInput.trim()
    ];

    const history = summarizeMessages(input.messages);
    if (history) {
        sections.push('\n\n# 历史对话', history);
    }
    return sections.join('\n');
};

const parseClassifierText = (text: string): IntentClassificationResult => {
    try {
        const parsed = JSON.parse(text.trim());
        return {
            intent: normalizeIntent(parsed.intent),
            confidence: clampConfidence(Number(parsed.confidence)),
            reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
            suggestedQuery: typeof parsed.suggested_query === 'string' ? parsed.suggested_query : undefined,
            source: 'llm',
            rawOutput: text.trim()
        };
    } catch (error) {
        logger.error('解析分类结果失败，回退默认配置', { error, text });
        return {
            ...FALLBACK_RESULT,
            rawOutput: text.trim()
        };
    }
};

/**
 * 调用大模型识别用户问题类型。
 */
export async function classifyUserIntent(input: IntentClassifierInput): Promise<IntentClassificationResult> {
    const trimmed = input.userInput.trim();
    if (!trimmed) {
        return {
            ...FALLBACK_RESULT,
            confidence: 0,
            reason: '输入为空'
        };
    }

    try {
        const prompt = await loadPrompt(AIBOT_PROMPT_FILES.QUESTION_CLASSIFIER);
        const llmConfig = resolveLLMConfig(undefined, {
            model: 'gpt-4.1-nano',
            temperature: 0
        });
        const customProvider = createOpenAICompatible({
            name: 'custom-llm-classifier',
            baseURL: llmConfig.baseURL,
            apiKey: llmConfig.apiKey
        });
        
        const model = customProvider(llmConfig.model);

        const result = await generateText({
            model,
            system: prompt,
            prompt: buildClassifierPrompt({ ...input, userInput: trimmed })
        });

        return parseClassifierText(result.text);
    } catch (error) {
        logger.error('调用问题分类模型失败', { error });
        return { ...FALLBACK_RESULT };
    }
}

/**
 * 粗略检测是否存在提示词注入风险。
 */
export function hasPromptInjectionRisk(content: string): boolean {
    if (!content.trim()) {
        return false;
    }
    return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(content));
}

/**
 * 判断是否可以复用上轮模式以跳过大模型调用。
 */
export function shouldBypassClassifier(content: string, previousMode?: AIBotMode): boolean {
    logger.info('shouldBypassClassifier 检查', {
        content,
        contentLength: content.length,
        previousMode,
        trimmedContent: content.trim()
    });

    if (!previousMode) {
        logger.info('shouldBypassClassifier: 没有上一轮模式，返回 false');
        return false;
    }
    const trimmed = content.trim();
    if (!trimmed) {
        logger.info('shouldBypassClassifier: 内容为空，返回 false');
        return false;
    }
    if (hasPromptInjectionRisk(trimmed)) {
        logger.info('shouldBypassClassifier: 检测到注入风险，返回 false');
        return false;
    }

    // 排除常见的问候语，避免误判为继续关键词
    const greetingPatterns = ['你好', '您好', 'hello', 'hi', '嗨', '在吗', '在不在'];
    const isGreeting = greetingPatterns.some(pattern =>
        trimmed.toLowerCase() === pattern.toLowerCase() ||
        trimmed.toLowerCase().startsWith(pattern.toLowerCase())
    );
    
    if (isGreeting) {
        logger.info('shouldBypassClassifier: 检测到问候语，返回 false', { trimmed, matchedPattern: greetingPatterns.find(p => trimmed.toLowerCase().includes(p.toLowerCase())) });
        return false;
    }

    if (previousMode === AIBOT_MODES.DEEP) {
        // 使用精确匹配而不是包含匹配，避免"你好"被误判
        const shouldBypass = trimmed.length <= 24 && CONTINUE_KEYWORDS.some((keyword) =>
            trimmed.toLowerCase() === keyword.toLowerCase() ||
            trimmed.toLowerCase().endsWith(keyword.toLowerCase())
        );
        logger.info('shouldBypassClassifier: 深度模式检查', {
            trimmedLength: trimmed.length,
            continueKeywords: CONTINUE_KEYWORDS,
            matchedKeyword: CONTINUE_KEYWORDS.find(keyword =>
                trimmed.toLowerCase() === keyword.toLowerCase() ||
                trimmed.toLowerCase().endsWith(keyword.toLowerCase())
            ),
            shouldBypass
        });
        return shouldBypass;
    }

    if (previousMode === AIBOT_MODES.TEXT) {
        // 使用精确匹配而不是包含匹配
        const shouldBypass = trimmed.length <= 12 && QUICK_ACK_KEYWORDS.some((keyword) =>
            trimmed.toLowerCase() === keyword.toLowerCase()
        );
        logger.info('shouldBypassClassifier: 文本模式检查', {
            trimmedLength: trimmed.length,
            quickAckKeywords: QUICK_ACK_KEYWORDS,
            matchedKeyword: QUICK_ACK_KEYWORDS.find(keyword => trimmed.toLowerCase() === keyword.toLowerCase()),
            shouldBypass
        });
        return shouldBypass;
    }

    logger.info('shouldBypassClassifier: 未知模式，返回 false');
    return false;
}
