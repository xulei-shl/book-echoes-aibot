import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { AIBOT_MODES, AIBOT_PROMPT_FILES, DEFAULT_MULTI_QUERY_TOP_K, DEFAULT_TOP_K } from '@/src/core/aibot/constants';
import { loadPrompt } from '@/src/core/aibot/promptLoader';
import { multiQuery, textSearch } from '@/src/core/aibot/retrievalService';
import { researchWithDuckDuckGo } from '@/src/core/aibot/mcp/duckduckgoResearcher';
import type { ChatWorkflowContext, ChatWorkflowInput, DraftWorkflowResult, RetrievalResultData } from '@/src/core/aibot/types';
import { resolveLLMConfig, type LLMConfig, type LLMHintMetadata } from '@/src/utils/aibot-env';
import { getLogger } from '@/src/utils/logger';

const logger = getLogger('aibot.workflow');

const createModel = (config: LLMConfig) => {
    logger.info('创建模型实例', {
        model: config.model,
        baseURL: config.baseURL,
        hasApiKey: !!config.apiKey
    });
    
    const customProvider = createOpenAICompatible({
        name: 'custom-llm',
        baseURL: config.baseURL,
        apiKey: config.apiKey
    });
    
    return customProvider(config.model);
};

const joinSnippets = (snippets: DraftWorkflowResult['searchSnippets']): string =>
    snippets
        .map((item, index) => `【${index + 1}】${item.title}\n${item.url}\n${item.snippet}`)
        .join('\n\n');

const extractLatestUserMessage = (messages: ChatWorkflowInput['messages']): string => {
    if (!Array.isArray(messages) || messages.length === 0) {
        return '';
    }
    
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i];
        if (message.role === 'user' && message.content.trim()) {
            return message.content;
        }
    }
    return '';
};

const buildSystemPrompt = (basePrompt: string, contextPlainText: string, userInput: string, draftMarkdown?: string) => {
    const sections: string[] = [
        basePrompt.trim(),
        '\n\n# 对话背景\n',
        `## 用户输入\n${userInput.trim()}`,
        `\n\n## 检索结果\n${contextPlainText.trim()}`
    ];

    if (draftMarkdown) {
        sections.push(`\n\n## 草稿参考\n${draftMarkdown.trim()}`);
    }

    return sections.join('');
};

/**
 * 深度检索草稿生成：DuckDuckGo 摘要 -> article_analysis -> article_cross_analysis。
 */
export async function runDraftWorkflow(userInput: string): Promise<DraftWorkflowResult> {
    const llmConfig = resolveLLMConfig();
    const model = createModel(llmConfig);

    const snippets = await researchWithDuckDuckGo(userInput, { topK: DEFAULT_TOP_K });
    const duckduckgoText = joinSnippets(snippets);

    const articlePrompt = await loadPrompt(AIBOT_PROMPT_FILES.ARTICLE_ANALYSIS);
    const analysisResult = await generateText({
        model,
        system: articlePrompt,
        prompt: `# 用户输入\n${userInput}\n\n# DuckDuckGo 摘要\n${duckduckgoText}`
    });

    const crossPrompt = await loadPrompt(AIBOT_PROMPT_FILES.ARTICLE_CROSS_ANALYSIS);
    const crossAnalysisResult = await generateText({
        model,
        system: crossPrompt,
        prompt: `# 用户输入\n${userInput}\n\n# 文章分析结果\n${analysisResult.text.trim()}`
    });

    const draftMarkdown = crossAnalysisResult.text.trim();

    return {
        userInput,
        searchSnippets: snippets,
        articleAnalysis: analysisResult.text.trim(),
        crossAnalysis: crossAnalysisResult.text.trim(),
        draftMarkdown
    };
}

/**
 * 根据检索模式准备 system prompt、上下文以及 LLM 配置。
 */
export async function buildChatWorkflowContext(
    input: ChatWorkflowInput
): Promise<ChatWorkflowContext & { retrievalResultData?: RetrievalResultData }> {
    const userInput = extractLatestUserMessage(input.messages);

    logger.info('buildChatWorkflowContext 开始', {
        mode: input.mode,
        userInput,
        messagesCount: input.messages.length,
        hasDraftMarkdown: !!input.draftMarkdown,
        hasDeepMetadata: !!input.deepMetadata,
        deepMetadataDraftMarkdown: input.deepMetadata?.draftMarkdown?.slice(0, 100) || null
    });

    if (!userInput) {
        throw new Error('缺少用户输入内容，无法启动 AIBot 工作流');
    }

    const draftMarkdown = input.draftMarkdown ?? input.deepMetadata?.draftMarkdown ?? '';

    logger.info('buildChatWorkflowContext 草稿检查', {
        inputDraftMarkdown: input.draftMarkdown?.slice(0, 100) || null,
        deepMetadataDraftMarkdown: input.deepMetadata?.draftMarkdown?.slice(0, 100) || null,
        finalDraftMarkdown: draftMarkdown?.slice(0, 100) || null,
        mode: input.mode
    });

    if (input.mode === AIBOT_MODES.DEEP && !draftMarkdown.trim()) {
        throw new Error('深度检索缺少草稿内容');
    }

    const retrieval =
        input.mode === AIBOT_MODES.TEXT
            ? await textSearch({
                query: userInput,
                top_k: DEFAULT_TOP_K
            })
            : await multiQuery({
                markdown_text: draftMarkdown,
                per_query_top_k: DEFAULT_MULTI_QUERY_TOP_K,
                final_top_k: DEFAULT_TOP_K
            });

    if (!retrieval.contextPlainText) {
        logger.error('检索结果为空', { mode: input.mode });
        throw new Error('图书检索返回空结果');
    }

    // 根据模式选择不同的提示词
    const promptFile = input.mode === AIBOT_MODES.TEXT
        ? AIBOT_PROMPT_FILES.SIMPLE_SEARCH
        : AIBOT_PROMPT_FILES.RECOMMENDATION;
    
    const basePrompt = await loadPrompt(promptFile);
    const composedSystemPrompt = buildSystemPrompt(
        basePrompt,
        retrieval.contextPlainText,
        userInput,
        draftMarkdown
    );

    const metadata = (retrieval.metadata ?? {}) as Record<string, unknown>;
    const llmHint = (metadata.llm_hint ?? metadata.llmHint) as LLMHintMetadata | undefined;
    const llmConfig = resolveLLMConfig(llmHint);

    return {
        mode: input.mode,
        systemPrompt: composedSystemPrompt,
        contextPlainText: retrieval.contextPlainText,
        metadata,
        llmConfig,
        retrievalResultData: retrieval.structuredData // 新增字段
    };
}

export { createModel };
