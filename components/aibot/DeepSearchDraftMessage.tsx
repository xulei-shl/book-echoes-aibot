'use client';

import UnifiedDraftMessage from './messages/UnifiedDraftMessage';
import type { DuckDuckGoSnippet, KeywordResult } from '@/src/core/aibot/types';

interface DeepSearchDraftMessageProps {
    draftMarkdown: string;
    isStreaming: boolean;
    isComplete: boolean;
    searchSnippets: DuckDuckGoSnippet[];
    keywords: KeywordResult[];
    onDraftChange?: (value: string) => void;
    onConfirm?: () => void;
    onRegenerate?: () => void;
    onCancel?: () => void;
}

export default function DeepSearchDraftMessage({
    draftMarkdown,
    isStreaming,
    isComplete,
    searchSnippets,
    keywords,
    onDraftChange,
    onConfirm,
    onRegenerate,
    onCancel
}: DeepSearchDraftMessageProps) {
    return (
        <UnifiedDraftMessage
            title="📝 检索草稿"
            draftMarkdown={draftMarkdown}
            isStreaming={isStreaming}
            isComplete={isComplete}
            searchSnippets={searchSnippets}
            keywords={keywords}
            onDraftChange={onDraftChange}
            onConfirm={onConfirm}
            onRegenerate={onRegenerate}
            onCancel={onCancel}
        />
    );
}
