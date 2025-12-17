import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { AIBOT_MODES, AIBOT_PROMPT_FILES, DEFAULT_MULTI_QUERY_TOP_K, DEFAULT_TOP_K } from '@/src/core/aibot/constants';
import { loadPrompt } from '@/src/core/aibot/promptLoader';
import { multiQuery, textSearch } from '@/src/core/aibot/retrievalService';
import { researchWithDuckDuckGo } from '@/src/core/aibot/mcp/duckduckgoResearcher';
import type { ChatWorkflowContext, ChatWorkflowInput, DraftWorkflowResult } from '@/src/core/aibot/types';
import { resolveLLMConfig, type LLMConfig, type LLMHintMetadata } from '@/src/utils/aibot-env';
import { getLogger } from '@/src/utils/logger';

const logger = getLogger('aibot.workflow');

const createModel = (config: LLMConfig) =>
    openai(config.model, {
        baseURL: config.baseURL,
        apiKey: config.apiKey
    });

const joinSnippets = (snippets: DraftWorkflowResult['searchSnippets']): string =>
    snippets
        .map((item, index) => `【${index + 1}】${item.title}\n${item.url}\n${item.snippet}`)
        .join('\n\n');

const extractLatestUserMessage = (messages: ChatWorkflowInput['messages']): string => {
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
): Promise<ChatWorkflowContext> {
    const userInput = extractLatestUserMessage(input.messages);

    if (!userInput) {
        throw new Error('缺少用户输入内容，无法启动 AIBot 工作流');
    }

    const draftMarkdown = input.draftMarkdown ?? input.deepMetadata?.draftMarkdown ?? '';

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

    const recommendationPrompt = await loadPrompt(AIBOT_PROMPT_FILES.RECOMMENDATION);
    const composedSystemPrompt = buildSystemPrompt(
        recommendationPrompt,
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
        llmConfig
    };
}

export { createModel };
