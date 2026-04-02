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
            <div className="aibot-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3 text-sm font-medium text-[#E8E6DC] font-info-content">
                    {content.isStreaming ? (
                        <>
                            <div className="h-4 w-4 rounded-full border-2 border-[#C9A063] border-t-transparent animate-spin"></div>
                            正在生成交叉分析报告...
                        </>
                    ) : content.isComplete ? (
                        <>
                            <div className="h-4 w-4 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.32)]"></div>
                            交叉分析报告生成完成
                        </>
                    ) : (
                        <>
                            <div className="h-4 w-4 rounded-full bg-[#C9A063] shadow-[0_0_14px_rgba(201,160,99,0.32)]"></div>
                            交叉分析报告
                        </>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="aibot-chip">文档输入</span>
                    {content.documentAnalyses.length > 0 && (
                        <span className="aibot-chip aibot-chip--active">{content.documentAnalyses.length} 篇文档</span>
                    )}
                </div>
            </div>

            {/* 文档信息 */}
            <div className="aibot-panel px-4 py-3 text-xs text-[#A2A09A] font-info-content">
                <div>基于以下文档的分析：</div>
                <div className="mt-2 text-[#E8E6DC] leading-6">{content.userInput}</div>
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
                <div className="aibot-panel flex items-center gap-2 px-4 py-3 text-sm font-medium text-[#E8E6DC] font-info-content">
                    {documentAnalysisPhase === 'book-search' ? (
                        <>
                            <div className="h-3.5 w-3.5 rounded-full border-2 border-[#C9A063] border-t-transparent animate-spin"></div>
                            正在检索相关图书...
                        </>
                    ) : (
                        <>
                            <div className="h-3.5 w-3.5 rounded-full bg-emerald-400"></div>
                            图书检索完成
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
