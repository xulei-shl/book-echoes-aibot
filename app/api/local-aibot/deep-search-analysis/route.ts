import { NextResponse } from 'next/server';
import { assertAIBotEnabled, AIBotDisabledError } from '@/src/utils/aibot-env';
import { getLogger } from '@/src/utils/logger';
import { researchWithDuckDuckGo } from '@/src/core/aibot/mcp/duckduckgoResearcher';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { loadPrompt } from '@/src/core/aibot/promptLoader';
import { resolveLLMConfig } from '@/src/utils/aibot-env';
import { AIBOT_PROMPT_FILES, DEEP_SEARCH_SNIPPETS_PER_KEYWORD } from '@/src/core/aibot/constants';
import type { DuckDuckGoSnippet } from '@/src/core/aibot/types';

const logger = getLogger('aibot.api.deep-search-analysis');

const createModel = (config: any) => {
    logger.info('创建深度检索分析模型实例', {
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

interface DeepSearchAnalysisRequest {
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
        const { userInput } = body as DeepSearchAnalysisRequest;

        if (!userInput || typeof userInput !== 'string') {
            return NextResponse.json({ message: 'userInput 不能为空' }, { status: 400 });
        }

        logger.info('开始深度检索分析流程', { userInput });

        const llmConfig = resolveLLMConfig();
        const model = createModel(llmConfig);

        // 第一步：自动生成关键词
        logger.info('开始生成检索关键词');
        
        const keywordPrompt = await loadPrompt(AIBOT_PROMPT_FILES.KEYWORD_GENERATION);
        const keywordResult = await generateText({
            model,
            system: keywordPrompt,
            prompt: `用户输入：${userInput}\n\n请生成适合的检索关键词。`
        });

        let parsedKeywordResult: { keywords: KeywordResult[] };
        
        try {
            // 处理可能被markdown代码块包装的JSON
            let textToParse = keywordResult.text.trim();
            
            if (textToParse.startsWith('```json')) {
                textToParse = textToParse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (textToParse.startsWith('```')) {
                textToParse = textToParse.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            
            parsedKeywordResult = JSON.parse(textToParse.trim());
        } catch (parseError) {
            logger.error('关键词生成结果解析失败', { 
                rawText: keywordResult.text, 
                error: parseError 
            });
            
            // 提供默认关键词作为回退
            parsedKeywordResult = {
                keywords: [
                    {
                        keyword: userInput,
                        reason: '基于用户原始输入',
                        priority: 'high' as const
                    }
                ]
            };
        }

        const keywords = parsedKeywordResult.keywords;
        logger.info('关键词生成完成', { 
            keywordCount: keywords.length,
            keywords: keywords.map(k => k.keyword)
        });

        // 第二步：对每个关键词进行检索
        const allSnippets: DuckDuckGoSnippet[] = [];
        const allAnalyses: string[] = [];

        for (const keywordItem of keywords) {
            logger.info('检索关键词', { keyword: keywordItem.keyword });
            
            // 使用DuckDuckGo检索
            const snippets = await researchWithDuckDuckGo(keywordItem.keyword, { topK: DEEP_SEARCH_SNIPPETS_PER_KEYWORD });
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

        // 第三步：交叉分析
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

        return NextResponse.json({
            success: true,
            keywords,
            searchSnippets: allSnippets,
            articleAnalysis: combinedAnalyses,
            draftMarkdown,
            userInput
        });

    } catch (error) {
        logger.error('深度检索分析失败', { error });
        return NextResponse.json({ 
            message: '深度检索分析失败，请稍后重试',
            success: false
        }, { status: 500 });
    }
}