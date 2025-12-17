import { NextResponse } from 'next/server';
import { assertAIBotEnabled, AIBotDisabledError } from '@/src/utils/aibot-env';
import { getLogger } from '@/src/utils/logger';
import { multiQuery } from '@/src/core/aibot/retrievalService';
import { researchWithDuckDuckGo } from '@/src/core/aibot/mcp/duckduckgoResearcher';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { loadPrompt } from '@/src/core/aibot/promptLoader';
import { resolveLLMConfig } from '@/src/utils/aibot-env';
import { AIBOT_PROMPT_FILES } from '@/src/core/aibot/constants';
import type { BookInfo, DuckDuckGoSnippet } from '@/src/core/aibot/types';

const logger = getLogger('aibot.api.deep-search');

const createModel = (config: any) => {
    logger.info('创建深度检索模型实例', {
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

const joinSnippets = (snippets: DuckDuckGoSnippet[]): string =>
    snippets
        .map((item, index) => `【${index + 1}】${item.title}\n${item.url}\n${item.snippet}`)
        .join('\n\n');

interface KeywordResult {
    keyword: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
}

interface DeepSearchRequest {
    keywords: KeywordResult[];
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
        const { keywords, userInput } = body as DeepSearchRequest;
        
        if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
            return NextResponse.json({ message: 'keywords 不能为空' }, { status: 400 });
        }

        if (!userInput || typeof userInput !== 'string') {
            return NextResponse.json({ message: 'userInput 不能为空' }, { status: 400 });
        }

        logger.info('开始深度检索流程', { 
            keywordCount: keywords.length,
            keywords: keywords.map(k => k.keyword),
            userInput 
        });

        const llmConfig = resolveLLMConfig();
        const model = createModel(llmConfig);

        // 第一步：对每个关键词进行检索
        const allSnippets: DuckDuckGoSnippet[] = [];
        const allAnalyses: string[] = [];

        for (const keywordItem of keywords) {
            logger.info('检索关键词', { keyword: keywordItem.keyword });
            
            // 使用DuckDuckGo检索
            const snippets = await researchWithDuckDuckGo(keywordItem.keyword, { topK: 3 });
            allSnippets.push(...snippets);

            if (snippets.length > 0) {
                // 单篇分析
                const articlePrompt = await loadPrompt(AIBOT_PROMPT_FILES.ARTICLE_ANALYSIS);
                const duckduckgoText = joinSnippets(snippets);
                
                const analysisResult = await generateText({
                    model,
                    system: articlePrompt,
                    prompt: `# 关键词\n${keywordItem.keyword}\n\n# 用户原始输入\n${userInput}\n\n# DuckDuckGo 摘要\n${duckduckgoText}`
                });

                allAnalyses.push(analysisResult.text.trim());
                logger.info('关键词分析完成', { 
                    keyword: keywordItem.keyword,
                    analysisLength: analysisResult.text.length 
                });
            }
        }

        // 第二步：交叉分析
        const crossPrompt = await loadPrompt(AIBOT_PROMPT_FILES.ARTICLE_CROSS_ANALYSIS);
        const combinedAnalyses = allAnalyses.join('\n\n---\n\n');
        
        const crossAnalysisResult = await generateText({
            model,
            system: crossPrompt,
            prompt: `# 用户原始输入\n${userInput}\n\n# 检索关键词\n${keywords.map(k => `- ${k.keyword} (${k.priority})`).join('\n')}\n\n# 文章分析结果\n${combinedAnalyses}`
        });

        const draftMarkdown = crossAnalysisResult.text.trim();
        
        logger.info('交叉分析完成', { 
            draftLength: draftMarkdown.length,
            snippetsCount: allSnippets.length,
            analysesCount: allAnalyses.length
        });

        // 第三步：基于草稿进行图书检索
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
            searchSnippets: allSnippets,
            articleAnalysis: combinedAnalyses,
            crossAnalysis: draftMarkdown,
            retrievalResult: retrieval.structuredData,
            userInput
        });

    } catch (error) {
        logger.error('深度检索失败', { error });
        return NextResponse.json({ 
            message: '深度检索失败，请稍后重试',
            success: false
        }, { status: 500 });
    }
}