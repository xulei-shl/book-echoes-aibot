'use client';

import UnifiedDraftMessage from './messages/UnifiedDraftMessage';
import type { DocumentAnalysisDraftContent } from '@/src/core/aibot/types';

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
    return (
        <UnifiedDraftMessage
            title="📝 交叉分析报告"
            draftMarkdown={content.draftMarkdown}
            isStreaming={content.isStreaming}
            isComplete={content.isComplete}
            documents={content.documentAnalyses}
            userInput={content.userInput}
            onDraftChange={onDraftChange}
            onConfirm={onDraftConfirm}
            onRegenerate={onDraftRegenerate}
            onCancel={onDraftCancel}
        />
    );
}
