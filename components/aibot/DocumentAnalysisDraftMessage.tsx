'use client';

import React, { useState } from 'react';
import DraftConfirmationDisplay from './DraftConfirmationDisplay';
import type { DocumentAnalysisDraftContent } from '@/src/core/aibot/types';
import { useAIBotStore } from '@/store/aibot/useAIBotStore';

interface DocumentAnalysisDraftMessageProps {
    content: DocumentAnalysisDraftContent;
    onDraftChange: (value: string) => void;
    onDraftConfirm: () => void;
    onDraftRegenerate: () => void;
    onDraftCancel: () => void;
}

export default function DocumentAnalysisDraftMessage({
    content,
    onDraftChange,
    onDraftConfirm,
    onDraftRegenerate,
    onDraftCancel
}: DocumentAnalysisDraftMessageProps) {
    const [isEditing, setIsEditing] = useState(false);
    const { documentAnalysisPhase } = useAIBotStore();

    const handleEdit = () => {
        setIsEditing(true);
    };

    const handleSave = () => {
        setIsEditing(false);
        onDraftConfirm();
    };

    const handleCancel = () => {
        setIsEditing(false);
        onDraftCancel();
    };

    return (
        <div className="space-y-4">
            {/* 标题 */}
            <div className="flex items-center gap-2 text-sm font-medium text-[#E8E6DC]">
                {content.isStreaming ? (
                    <>
                        <div className="w-4 h-4 border-2 border-[#C9A063] border-t-transparent rounded-full animate-spin"></div>
                        正在生成交叉分析报告...
                    </>
                ) : content.isComplete ? (
                    <>
                        <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                        交叉分析报告生成完成
                    </>
                ) : (
                    <>
                        <div className="w-4 h-4 bg-[#C9A063] rounded-full"></div>
                        交叉分析报告
                    </>
                )}
            </div>

            {/* 文档信息 */}
            <div className="text-xs text-[#A2A09A] bg-[#2A2A2A] rounded-lg p-3">
                <div>基于以下文档的分析：</div>
                <div className="mt-1 text-[#E8E6DC]">{content.userInput}</div>
                {content.documentAnalyses.length > 0 && (
                    <div className="mt-2 text-[#6F6D68]">
                        共分析了 {content.documentAnalyses.length} 篇文档
                    </div>
                )}
            </div>

            {/* 草稿内容显示和编辑 */}
            <DraftConfirmationDisplay
                draftMarkdown={content.draftMarkdown}
                onDraftChange={onDraftChange}
                onConfirm={handleSave}
                onCancel={handleCancel}
                onRegenerate={onDraftRegenerate}
                isGenerating={content.isStreaming}
            />

            {/* 图书检索进度提示 - 放在交叉分析模块底部 */}
            {(documentAnalysisPhase === 'book-search' || documentAnalysisPhase === 'book-selection') && (
                <div className="flex items-center gap-2 text-sm font-medium text-[#E8E6DC]">
                    {documentAnalysisPhase === 'book-search' ? (
                        <>
                            <div className="w-3 h-3 border-2 border-[#C9A063] border-t-transparent rounded-full animate-spin"></div>
                            正在检索相关图书...
                        </>
                    ) : (
                        <>
                            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                            图书检索完成
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
