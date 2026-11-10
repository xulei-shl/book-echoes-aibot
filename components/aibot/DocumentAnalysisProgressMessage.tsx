'use client';

import UnifiedProgressMessage from './messages/UnifiedProgressMessage';
import type { DocumentAnalysisProgressContent } from '@/src/core/aibot/types';

interface DocumentAnalysisProgressMessageProps {
    content: DocumentAnalysisProgressContent;
}

export default function DocumentAnalysisProgressMessage({ content }: DocumentAnalysisProgressMessageProps) {
    return (
        <UnifiedProgressMessage
            logs={content.logs}
            currentPhase={content.currentPhase}
            title="文档分析进度"
        />
    );
}
