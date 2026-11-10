'use client';

import UnifiedBookSelection from './messages/UnifiedBookSelection';
import type { RetrievalResultData, BookInfo } from '@/src/core/aibot/types';

export default function RetrievalResultDisplay({
    retrievalResult,
    mode = 'display',
    selectedBookIds = new Set(),
    onSelectionChange,
    onGenerateInterpretation,
    onReenterSelection,
    onSecondaryRetrieval,
    originalQuery = ''
}: {
    retrievalResult: RetrievalResultData;
    mode?: 'display' | 'selection';
    selectedBookIds?: Set<string>;
    onSelectionChange?: (bookId: string, isSelected: boolean) => void;
    onGenerateInterpretation?: (selectedBookIds: Set<string>) => void;
    onReenterSelection?: () => void;
    onSecondaryRetrieval?: (selectedBooks: BookInfo[], originalQuery: string) => void;
    originalQuery?: string;
}) {
    return (
        <UnifiedBookSelection
            books={retrievalResult.books}
            mode={mode}
            selectedBookIds={selectedBookIds}
            userInput={originalQuery}
            onBookSelectionChange={onSelectionChange}
            onGenerateInterpretation={() => onGenerateInterpretation?.(selectedBookIds)}
            onReenterSelection={onReenterSelection}
            onSecondaryRetrieval={onSecondaryRetrieval}
        />
    );
}
