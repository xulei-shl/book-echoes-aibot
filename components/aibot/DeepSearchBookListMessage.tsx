'use client';

import UnifiedBookSelection from './messages/UnifiedBookSelection';
import type { BookInfo } from '@/src/core/aibot/types';

interface DeepSearchBookListMessageProps {
    books: BookInfo[];
    draftMarkdown: string;
    userInput: string;
    onBookSelection?: (selectedBooks: BookInfo[]) => void;
    onGenerateInterpretation?: (selectedBooks: BookInfo[], draftMarkdown: string) => void;
    onSecondaryRetrieval?: (selectedBooks: BookInfo[], query: string) => void;
    isLoading?: boolean;
    autoCollapseOnReportStart?: boolean;
}

export default function DeepSearchBookListMessage({
    books,
    draftMarkdown,
    userInput,
    onBookSelection,
    onGenerateInterpretation,
    onSecondaryRetrieval,
    isLoading = false,
    autoCollapseOnReportStart = false
}: DeepSearchBookListMessageProps) {
    return (
        <UnifiedBookSelection
            books={books}
            draftMarkdown={draftMarkdown}
            userInput={userInput}
            isLoading={isLoading}
            autoCollapseOnReportStart={autoCollapseOnReportStart}
            onSelectionBatchChange={(selected) => onBookSelection?.(selected)}
            onGenerateInterpretation={(selected, draft) =>
                onGenerateInterpretation?.(selected, draft || draftMarkdown)
            }
            onSecondaryRetrieval={onSecondaryRetrieval}
        />
    );
}
