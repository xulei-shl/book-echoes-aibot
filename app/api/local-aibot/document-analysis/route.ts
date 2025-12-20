import { NextResponse } from 'next/server';
import { assertAIBotEnabled, AIBotDisabledError } from '@/src/utils/aibot-env';
import { getLogger } from '@/src/utils/logger';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText } from 'ai';
import { loadPrompt } from '@/src/core/aibot/promptLoader';
import { resolveLLMConfig } from '@/src/utils/aibot-env';
import { AIBOT_PROMPT_FILES } from '@/src/core/aibot/constants';
import type { DocumentAnalysisRequest } from '@/src/core/aibot/types';

const logger = getLogger('aibot.api.document-analysis');

// 进度回调函数类型
type ProgressCallback = (phase: string, message: string, status: 'running' | 'completed' | 'error', details?: string) => void;

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

const createModel = (config: any) => {
    logger.info('创建文档分析模型实例', {
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
            try {
                const body = await request.json();
                const { documents } = body as DocumentAnalysisRequest;

                if (!documents || !Array.isArray(documents) || documents.length === 0) {
                    sendProgress(controller, 'error', '文档列表不能为空', 'error');
                    controller.close();
                    return;
                }

                logger.info('开始文档分析流程', {
                    documentCount: documents.length,
                    documentNames: documents.map(doc => doc.name)
                });

                const llmConfig = resolveLLMConfig();
                const model = createModel(llmConfig);

                // 第一步：文档分析（并行处理所有文档）
                logger.info('开始文档分析');
                sendProgress(controller, 'document-analysis', '正在分析文档内容...', 'running');

                const documentAnalyses: string[] = [];
                let analysisCompleted = 0;
                const totalDocuments = documents.length;

                // 并行分析所有文档
                const analysisPromises = documents.map(async (document, index) => {
                    logger.info('分析文档', { documentName: document.name });

                    try {
                        const articlePrompt = await loadPrompt(AIBOT_PROMPT_FILES.ARTICLE_ANALYSIS);

                        const analysisResult = await generateText({
                            model,
                            system: articlePrompt,
                            prompt: `# 文档名称\n${document.name}\n\n# 文档内容\n${document.content}`
                        });

                        // 更新分析进度
                        analysisCompleted++;
                        sendProgress(controller, 'document-analysis',
                            `文档分析完成: ${document.name} (${analysisCompleted}/${totalDocuments})`,
                            analysisCompleted === totalDocuments ? 'completed' : 'running',
                            `已完成 ${analysisCompleted}/${totalDocuments} 个文档分析`
                        );

                        return { analysis: analysisResult.text.trim(), documentName: document.name };

                    } catch (error) {
                        logger.error('文档分析失败', { documentName: document.name, error });

                        // 即使分析失败也要更新进度
                        analysisCompleted++;
                        sendProgress(controller, 'document-analysis',
                            `文档分析失败: ${document.name} (${analysisCompleted}/${totalDocuments})`,
                            'running',
                            `已完成 ${analysisCompleted}/${totalDocuments} 个文档分析`
                        );

                        return {
                            analysis: `文档 ${document.name} 分析失败：${error instanceof Error ? error.message : '未知错误'}`,
                            documentName: document.name
                        };
                    }
                });

                // 等待所有分析完成
                const analysisResults = await Promise.all(analysisPromises);

                // 整合分析结果
                analysisResults.forEach(result => {
                    if (result.analysis) {
                        documentAnalyses.push(result.analysis);
                    }
                });

                logger.info('文档分析完成', {
                    totalAnalyses: documentAnalyses.length,
                    analysisLength: documentAnalyses.reduce((sum, analysis) => sum + analysis.length, 0)
                });

                sendProgress(controller, 'document-analysis',
                    `所有文档分析完成，共生成 ${documentAnalyses.length} 篇分析`,
                    'completed'
                );

                // 第二步：交叉分析（流式输出草稿）
                sendProgress(controller, 'cross-analysis', '正在进行交叉分析...', 'running');

                const crossPrompt = await loadPrompt(AIBOT_PROMPT_FILES.ARTICLE_CROSS_ANALYSIS);
                const combinedAnalyses = documentAnalyses.join('\n\n---\n\n');
                const documentNames = documents.map(doc => doc.name).join(', ');

                // 发送草稿开始事件，包含元数据
                const draftStartData = {
                    type: 'draft-start',
                    documentAnalyses,
                    userInput: `文档分析：${documentNames}`
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(draftStartData)}\n\n`));

                // 使用 streamText 实现草稿流式输出
                const crossAnalysisStream = await streamText({
                    model,
                    system: crossPrompt,
                    prompt: `# 文档名称\n${documentNames}\n\n# 文档分析结果\n${combinedAnalyses}`
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
                    documentsCount: documents.length,
                    analysesCount: documentAnalyses.length
                });

                sendProgress(controller, 'cross-analysis', '交叉分析完成', 'completed',
                    `生成了 ${draftMarkdown.length} 字符的草稿`
                );

                // 发送草稿完成事件
                const draftCompleteData = {
                    type: 'draft-complete',
                    success: true,
                    draftMarkdown,
                    documentAnalyses: combinedAnalyses
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(draftCompleteData)}\n\n`));

                controller.close();

            } catch (error) {
                logger.error('文档分析失败', { error });
                sendProgress(controller, 'error', '文档分析失败', 'error',
                    error instanceof Error ? error.message : '未知错误'
                );
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