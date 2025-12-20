'use client';

import React from 'react';
import ProgressLogDisplay from './ProgressLogDisplay';
import type { DocumentAnalysisProgressContent, DocumentAnalysisLogEntry } from '@/src/core/aibot/types';

interface DocumentAnalysisProgressMessageProps {
    content: DocumentAnalysisProgressContent;
}

export default function DocumentAnalysisProgressMessage({ content }: DocumentAnalysisProgressMessageProps) {
    // 将文档分析日志转换为ProgressLogDisplay需要的格式
    const logEntries = content.logs.map(log => ({
        id: log.id,
        timestamp: log.timestamp,
        phase: log.phase as any, // 类型转换
        status: log.status as any,
        message: log.message,
        details: log.details
    }));

    return (
        <div className="space-y-4">
            {/* 标题 */}
            <div className="flex items-center gap-2 text-sm font-medium text-[#E8E6DC]">
                <div className="w-4 h-4 border-2 border-[#C9A063] border-t-transparent rounded-full animate-spin"></div>
                文档分析进度
            </div>

            {/* 进度日志显示 */}
            <ProgressLogDisplay
                isVisible={true}
                logs={logEntries}
                currentPhase={content.currentPhase}
                title="文档分析进度"
            />

            {/* 当前阶段信息 */}
            {content.currentPhase && (
                <div className="text-xs text-[#A2A09A] bg-[#2A2A2A] rounded-lg p-3">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-[#C9A063] rounded-full animate-pulse"></div>
                        <span>当前阶段：{content.currentPhase}</span>
                    </div>
                </div>
            )}
        </div>
    );
}