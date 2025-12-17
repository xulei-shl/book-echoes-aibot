import { NextResponse } from 'next/server';
import { assertAIBotEnabled, AIBotDisabledError } from '@/src/utils/aibot-env';
import { getLogger } from '@/src/utils/logger';
import { runDraftWorkflow } from '@/src/core/aibot/researchWorkflow';

const logger = getLogger('aibot.api.draft');

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
        const rawInput = typeof body?.user_input === 'string' ? body.user_input.trim() : '';
        if (!rawInput) {
            return NextResponse.json({ message: 'user_input 不能为空' }, { status: 400 });
        }

        const result = await runDraftWorkflow(rawInput);

        return NextResponse.json({
            draft_markdown: result.draftMarkdown,
            search_snippets: result.searchSnippets,
            article_analysis: result.articleAnalysis,
            article_cross_analysis: result.crossAnalysis
        });
    } catch (error) {
        logger.error('深度检索草稿生成失败', { error });
        return NextResponse.json({ message: '生成草稿失败，请稍后重试' }, { status: 500 });
    }
}
