import { NextResponse } from 'next/server';
import { assertAIBotEnabled, AIBotDisabledError } from '@/src/utils/aibot-env';
import { getLogger } from '@/src/utils/logger';
import { performWebSearch } from '@/src/core/aibot/webSearchService';
import { loadPrompt } from '@/src/core/aibot/promptLoader';
import { generateTextWithFallback, getLLMConfigSummary, streamTextWithFallback } from '@/src/core/aibot/llmClient';
import { AIBOT_PROMPT_FILES } from '@/src/core/aibot/constants';
import type { WebSearchSnippet } from '@/src/core/aibot/types';

const logger = getLogger('aibot.api.deep-search-analysis');

const getErrorDetails = (error: unknown): string => {
    if (!(error instanceof Error)) {
        return '未知错误';
    }

    const maybeApiError = error as Error & {
        statusCode?: number;
        responseBody?: string;
        cause?: { message?: string };
    };

    const parts = [error.message];

    if (typeof maybeApiError.statusCode === 'number') {
        parts.push(`status=${maybeApiError.statusCode}`);
    }

    if (typeof maybeApiError.responseBody === 'string' && maybeApiError.responseBody.trim()) {
        parts.push(`response=${maybeApiError.responseBody.trim().slice(0, 500)}`);
    } else if (typeof maybeApiError.cause?.message === 'string' && maybeApiError.cause.message.trim()) {
        parts.push(`cause=${maybeApiError.cause.message.trim().slice(0, 300)}`);
    }

    return parts.join(' | ');
};

// 发送SSE进度更新
const sendProgress = (controller: ReadableStreamDefaultController, phase: string, message: string, status: 'running' | 'completed' | 'error', details?: string) => {
    const progressData = {
        type: 'progress',
        phase,
        message,
        status,
        details,
        timestamp: new Date().toISOString()
    };
    
    const data = `data: ${JSON.stringify(progressData)}\n\n`;
    controller.enqueue(new TextEncoder().encode(data));
};

const joinSnippets = (snippets: WebSearchSnippet[]): string =>
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

    // 创建SSE流
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
        async start(controller) {
            let currentPhase = 'init';
            try {
                const body = await request.json();
                const { userInput } = body as DeepSearchAnalysisRequest;

                if (!userInput || typeof userInput !== 'string') {
                    sendProgress(controller, 'error', 'userInput 不能为空', 'error');
                    controller.close();
                    return;
                }

                logger.info('开始深度检索分析流程', { userInput });

                const llmConfigSummary = getLLMConfigSummary();

                logger.info('深度检索分析使用 LLM 配置', {
                    llmConfigSummary
                });

                currentPhase = 'keyword';
                logger.info('开始生成检索关键词');
                sendProgress(controller, 'keyword', '正在生成检索关键词...', 'running', llmConfigSummary);
                
                const keywordPrompt = await loadPrompt(AIBOT_PROMPT_FILES.KEYWORD_GENERATION);
                const keywordResult = await generateTextWithFallback({
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
                
                sendProgress(controller, 'keyword', `成功生成 ${keywords.length} 个关键词`, 'completed',
                    keywords.map(k => k.keyword).join(', '));

                // 第二步：对每个关键词进行检索和分析
                const allSnippets: WebSearchSnippet[] = [];
                const allAnalyses: string[] = [];

                // 初始化进度计数
                let searchCompleted = 0;
                let analysisCompleted = 0;
                const totalKeywords = keywords.length;

                currentPhase = 'search';
                const useJina = process.env.USE_JINA_SEARCH !== 'false';
                const searchEngine = useJina ? 'Jina' : 'DuckDuckGo';
                sendProgress(controller, 'search', `正在执行${searchEngine}检索...`, 'running');
                sendProgress(controller, 'analysis', '准备分析检索结果...', 'running');

                // 并行处理所有关键词的检索和分析
                const searchAndAnalysisPromises = keywords.map(async (keywordItem, index) => {
                    logger.info('检索关键词', { keyword: keywordItem.keyword });

                    currentPhase = 'search';
                    const snippets = await performWebSearch(keywordItem.keyword);

                    // 更新检索进度
                    searchCompleted++;
                    sendProgress(controller, 'search', `正在检索关键词... (${searchCompleted}/${totalKeywords})`,
                        searchCompleted === totalKeywords ? 'completed' : 'running',
                        `已检索 ${searchCompleted}/${totalKeywords} 个关键词`);

                    if (snippets.length > 0) {
                        currentPhase = 'analysis';
                        // 单篇分析
                        sendProgress(controller, 'analysis', `正在分析关键词: ${keywordItem.keyword}`, 'running');

                        const articlePrompt = await loadPrompt(AIBOT_PROMPT_FILES.ARTICLE_ANALYSIS);
                        const searchResultText = joinSnippets(snippets);

                        const analysisResult = await generateTextWithFallback({
                            system: articlePrompt,
                            prompt: `# 关键词\n${keywordItem.keyword}\n\n# 用户原始输入\n${userInput}\n\n# 网络搜索结果\n${searchResultText}`
                        });

                        // 更新分析进度
                        analysisCompleted++;
                        sendProgress(controller, 'analysis', `关键词分析完成: ${keywordItem.keyword} (${analysisCompleted}/${totalKeywords})`,
                            analysisCompleted === totalKeywords ? 'completed' : 'running',
                            `已完成 ${analysisCompleted}/${totalKeywords} 个关键词分析`);

                        return { snippets: [...snippets], analysis: analysisResult.text.trim(), keyword: keywordItem.keyword };
                    }

                    return { snippets: [], analysis: '', keyword: keywordItem.keyword };
                });

                // 等待所有检索和分析完成
                const results = await Promise.all(searchAndAnalysisPromises);

                // 整合结果
                results.forEach(result => {
                    allSnippets.push(...result.snippets);
                    if (result.analysis) {
                        allAnalyses.push(result.analysis);
                    }
                });

                // 最终进度确认
                sendProgress(controller, 'search', `${searchEngine}检索完成，获取 ${allSnippets.length} 条结果`, 'completed');
                sendProgress(controller, 'analysis', `所有关键词分析完成，共生成 ${allAnalyses.length} 篇分析`, 'completed');

                // 第三步：交叉分析（流式输出草稿）
                currentPhase = 'cross-analysis';
                sendProgress(controller, 'cross-analysis', '正在进行交叉分析...', 'running');

                const crossPrompt = await loadPrompt(AIBOT_PROMPT_FILES.ARTICLE_CROSS_ANALYSIS);
                const combinedAnalyses = allAnalyses.join('\n\n---\n\n');

                // 发送草稿开始事件，包含元数据
                const draftStartData = {
                    type: 'draft-start',
                    keywords,
                    searchSnippets: allSnippets,
                    userInput
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(draftStartData)}\n\n`));

                // 使用 streamText 实现草稿流式输出
                const crossAnalysisStream = await streamTextWithFallback({
                    system: crossPrompt,
                    prompt: `# 用户原始输入\n${userInput}\n\n# 检索关键词\n${keywords.map(k => `- ${k.keyword} (${k.priority})`).join('\n')}\n\n# 文章分析结果\n${combinedAnalyses}`
                });

                let draftMarkdown = '';

                // 逐块流式输出草稿内容
                for await (const chunk of crossAnalysisStream.textStream) {
                    draftMarkdown += chunk;
                    const draftChunkData = {
                        type: 'draft-chunk',
                        content: chunk
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(draftChunkData)}\n\n`));
                }

                draftMarkdown = draftMarkdown.trim();

                logger.info('交叉分析完成', {
                    draftLength: draftMarkdown.length,
                    snippetsCount: allSnippets.length,
                    analysesCount: allAnalyses.length
                });

                sendProgress(controller, 'cross-analysis', '交叉分析完成', 'completed', `生成了 ${draftMarkdown.length} 字符的草稿`);

                // 发送草稿完成事件
                const draftCompleteData = {
                    type: 'draft-complete',
                    success: true,
                    draftMarkdown,
                    articleAnalysis: combinedAnalyses
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(draftCompleteData)}\n\n`));

                controller.close();

            } catch (error) {
                const errorDetails = getErrorDetails(error);
                logger.error('深度检索分析失败', { currentPhase, error, errorDetails });
                sendProgress(controller, currentPhase, `深度检索分析失败（阶段: ${currentPhase}）`, 'error', errorDetails);
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}