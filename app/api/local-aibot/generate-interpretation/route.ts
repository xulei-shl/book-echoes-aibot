import { NextResponse } from 'next/server';
import { streamText } from 'ai';
import { assertAIBotEnabled, AIBotDisabledError } from '@/src/utils/aibot-env';
import { getLogger } from '@/src/utils/logger';
import { createModel } from '@/src/core/aibot/researchWorkflow';
import { loadPrompt } from '@/src/core/aibot/promptLoader';
import { AIBOT_PROMPT_FILES } from '@/src/core/aibot/constants';
import type { BookInfo, ChatMessage, GenerateInterpretationRequest } from '@/src/core/aibot/types';
import { resolveLLMConfig } from '@/src/utils/aibot-env';

const logger = getLogger('aibot.api.generate-interpretation');

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
        const payload = (await request.json()) as GenerateInterpretationRequest;
        const { originalQuery, selectedBooks, messages = [] } = payload;

        if (!originalQuery?.trim() || !selectedBooks?.length) {
            return NextResponse.json({ message: '缺少必要参数' }, { status: 400 });
        }

        // 构建用户提示词
        const userPrompt = buildUserPrompt(originalQuery, selectedBooks);
        
        // 加载系统提示词
        const systemPrompt = await loadPrompt(AIBOT_PROMPT_FILES.SIMPLE_SEARCH);
        
        // 获取LLM配置
        const llmConfig = resolveLLMConfig();

        logger.info('生成解读', {
            originalQuery,
            selectedBooksCount: selectedBooks.length,
            systemPromptLength: systemPrompt.length,
            userPromptLength: userPrompt.length
        });

        // 调用AI生成解读
        const result = streamText({
            model: createModel(llmConfig),
            system: systemPrompt,
            messages: [
                { role: 'user', content: userPrompt }
            ]
        });

        return result.toTextStreamResponse({
            headers: {
                'X-AIBot-Mode': 'interpretation',
                'X-AIBot-Books-Count': selectedBooks.length.toString()
            }
        });

    } catch (error) {
        logger.error('生成解读失败', { error });
        return NextResponse.json({ message: '生成解读失败，请稍后重试' }, { status: 500 });
    }
}

// 构建用户提示词
function buildUserPrompt(originalQuery: string, selectedBooks: BookInfo[]): string {
    const booksInfo = selectedBooks.map((book, index) => {
        return `## 图书 ${index + 1}
**书名：** ${book.title}
**作者：** ${book.author}
**评分：** ${book.rating || '暂无评分'}
**相似度：** ${book.similarityScore?.toFixed(3) || '暂无'}
**索书号：** ${book.callNumber || '暂无'}
**内容简介：** ${book.description || '暂无简介'}
**融合分数：** ${book.fusedScore?.toFixed(3) || '暂无'}
**最终分数：** ${book.finalScore?.toFixed(3) || '暂无'}`;
    }).join('\n\n');

    return `# 用户原始查询
${originalQuery}

# 候选图书列表
${booksInfo}

请基于以上信息，按照系统提示词的要求生成导读和书单推荐。`;
}