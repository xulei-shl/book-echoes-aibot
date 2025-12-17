import { NextResponse } from 'next/server';
import { assertAIBotEnabled, AIBotDisabledError } from '@/src/utils/aibot-env';
import { getLogger } from '@/src/utils/logger';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { loadPrompt } from '@/src/core/aibot/promptLoader';
import { resolveLLMConfig } from '@/src/utils/aibot-env';
import { AIBOT_PROMPT_FILES } from '@/src/core/aibot/constants';
import type { BookInfo } from '@/src/core/aibot/types';

const logger = getLogger('aibot.api.deep-interpretation');

const createModel = (config: any) => {
    logger.info('创建深度解读模型实例', {
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

interface DeepInterpretationRequest {
    selectedBooks: BookInfo[];
    draftMarkdown: string;
    originalQuery: string;
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
        const { selectedBooks, draftMarkdown, originalQuery } = body as DeepInterpretationRequest;
        
        if (!selectedBooks || !Array.isArray(selectedBooks) || selectedBooks.length === 0) {
            return NextResponse.json({ message: 'selectedBooks 不能为空' }, { status: 400 });
        }

        if (!draftMarkdown || typeof draftMarkdown !== 'string') {
            return NextResponse.json({ message: 'draftMarkdown 不能为空' }, { status: 400 });
        }

        if (!originalQuery || typeof originalQuery !== 'string') {
            return NextResponse.json({ message: 'originalQuery 不能为空' }, { status: 400 });
        }

        logger.info('开始生成深度解读', { 
            bookCount: selectedBooks.length,
            draftLength: draftMarkdown.length,
            originalQuery 
        });

        const llmConfig = resolveLLMConfig();
        const model = createModel(llmConfig);

        // 加载推荐导语提示词
        const recommendationPrompt = await loadPrompt(AIBOT_PROMPT_FILES.RECOMMENDATION);

        // 构建书籍列表文本
        const booksText = selectedBooks.map((book, index) => {
            return `## 书籍 ${index + 1}

**书名**: ${book.title}
${book.subtitle ? `**副标题**: ${book.subtitle}` : ''}
**作者**: ${book.author}
${book.publisher ? `**出版社**: ${book.publisher}` : ''}
${book.publishYear ? `**出版年份**: ${book.publishYear}` : ''}
${book.rating ? `**评分**: ${book.rating}` : ''}
${book.callNumber ? `**索书号**: ${book.callNumber}` : ''}

**内容简介**:
${book.description || '暂无简介'}

${book.authorIntro ? `**作者简介**:\n${book.authorIntro}` : ''}

${book.highlights && book.highlights.length > 0 ? `**亮点**: ${book.highlights.join('; ')}` : ''}

---
`;
        }).join('\n');

        // 构建完整提示词
        const fullPrompt = `# 主题分析报告

## 原始查询
${originalQuery}

## 检索草案
${draftMarkdown}

---

# 待选书目列表

${booksText}`;

        logger.info('开始调用模型生成深度解读', { 
            promptLength: fullPrompt.length,
            bookCount: selectedBooks.length 
        });

        const result = await generateText({
            model,
            system: recommendationPrompt,
            prompt: fullPrompt
        });

        const interpretation = result.text.trim();
        
        logger.info('深度解读生成完成', { 
            interpretationLength: interpretation.length,
            bookCount: selectedBooks.length 
        });

        return NextResponse.json({
            success: true,
            interpretation,
            selectedBooks,
            draftMarkdown,
            originalQuery
        });

    } catch (error) {
        logger.error('深度解读生成失败', { error });
        return NextResponse.json({ 
            message: '深度解读生成失败，请稍后重试',
            success: false
        }, { status: 500 });
    }
}