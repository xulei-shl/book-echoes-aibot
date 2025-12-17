import { NextResponse } from 'next/server';
import { assertAIBotEnabled, AIBotDisabledError } from '@/src/utils/aibot-env';
import { getLogger } from '@/src/utils/logger';

const logger = getLogger('aibot.api.clear');

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
        logger.info('收到清空聊天记录请求');
        
        // 这里可以添加清空后端存储的逻辑
        // 例如：清空数据库中的聊天记录、清除缓存等
        // 目前这个 API 主要用于前端状态重置，后端暂无持久化存储
        
        logger.info('聊天记录清空完成');
        
        return NextResponse.json({ 
            success: true, 
            message: '聊天记录已清空' 
        });
    } catch (error) {
        logger.error('清空聊天记录失败', { error });
        return NextResponse.json({ 
            success: false, 
            message: '清空失败，请稍后重试' 
        }, { status: 500 });
    }
}