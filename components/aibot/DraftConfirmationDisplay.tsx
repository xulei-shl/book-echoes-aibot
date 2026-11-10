'use client';

import UnifiedDraftMessage from './messages/UnifiedDraftMessage';

export interface DraftConfirmationDisplayProps {
    draftMarkdown: string;
    onDraftChange: (value: string) => void;
    onConfirm: () => void;
    onCancel: () => void;
    onRegenerate: () => void;
    isGenerating?: boolean;
    searchSnippets?: Array<{
        title: string;
        url: string;
        snippet: string;
    }>;
}

export default function DraftConfirmationDisplay({
    draftMarkdown,
    onDraftChange,
    onConfirm,
    onCancel,
    onRegenerate,
    isGenerating = false,
    searchSnippets = []
}: DraftConfirmationDisplayProps) {
    return (
        <UnifiedDraftMessage
            title="📝 草稿确认"
            draftMarkdown={draftMarkdown}
            isStreaming={isGenerating}
            searchSnippets={searchSnippets}
            onDraftChange={onDraftChange}
            onConfirm={onConfirm}
            onCancel={onCancel}
            onRegenerate={onRegenerate}
        />
    );
}
