'use client';

import React from 'react';
import ProgressLogDisplay from './ProgressLogDisplay';
import type { DocumentAnalysisProgressContent } from '@/src/core/aibot/types';

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
        <ProgressLogDisplay
            isVisible={true}
            logs={logEntries}
            currentPhase={content.currentPhase}
            title="文档分析进度"
        />
    );
}
