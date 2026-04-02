import { NextResponse } from 'next/server';
import { assertAIBotEnabled, AIBotDisabledError } from '@/src/utils/aibot-env';
import { getLogger } from '@/src/utils/logger';
import { generateTextWithFallback, getLLMConfigSummary } from '@/src/core/aibot/llmClient';
import { loadPrompt } from '@/src/core/aibot/promptLoader';
import { AIBOT_PROMPT_FILES } from '@/src/core/aibot/constants';

const logger = getLogger('aibot.api.keywords');

interface KeywordResult {
    keyword: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
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
        const userInput = typeof body?.user_input === 'string' ? body.user_input.trim() : '';
        
        if (!userInput) {
            return NextResponse.json({ message: 'user_input 不能为空' }, { status: 400 });
        }

        logger.info('开始生成检索关键词', {
            userInput,
            llmConfigSummary: getLLMConfigSummary()
        });

        // 加载关键词生成提示词
        const keywordPrompt = await loadPrompt(AIBOT_PROMPT_FILES.KEYWORD_GENERATION);

        const result = await generateTextWithFallback({
            system: keywordPrompt,
            prompt: `用户输入：${userInput}\n\n请生成适合的检索关键词。`
        });

        let parsedResult: { keywords: KeywordResult[] };
        
        try {
            // 处理可能被markdown代码块包装的JSON
            let textToParse = result.text.trim();
            
            // 如果结果被markdown代码块包装，提取其中的JSON内容
            if (textToParse.startsWith('```json')) {
                textToParse = textToParse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (textToParse.startsWith('```')) {
                textToParse = textToParse.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            
            parsedResult = JSON.parse(textToParse.trim());
        } catch (parseError) {
            logger.error('关键词生成结果解析失败', {
                rawText: result.text,
                error: parseError
            });
            
            // 提供默认关键词作为回退
            parsedResult = {
                keywords: [
                    {
                        keyword: userInput,
                        reason: '基于用户原始输入',
                        priority: 'high' as const
                    }
                ]
            };
        }

        logger.info('关键词生成完成', { 
            keywordCount: parsedResult.keywords.length,
            keywords: parsedResult.keywords.map(k => k.keyword)
        });

        return NextResponse.json({
            success: true,
            keywords: parsedResult.keywords,
            userInput
        });

    } catch (error) {
        logger.error('关键词生成失败', { error });
        return NextResponse.json({ 
            message: '关键词生成失败，请稍后重试',
            success: false
        }, { status: 500 });
    }
}