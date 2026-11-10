'use client';

import UnifiedProgressMessage, {
    type ProgressLogEntry,
    type ProgressLogInput
} from './messages/UnifiedProgressMessage';

export type SearchPhase = string;
export type LogEntry = ProgressLogEntry;

export interface ProgressLogDisplayProps {
    isVisible?: boolean;
    logs?: ProgressLogInput[];
    currentPhase?: string;
    onComplete?: () => void;
    title?: string;
}

export default function ProgressLogDisplay({
    isVisible = true,
    logs = [],
    currentPhase,
    title = '检索进度'
}: ProgressLogDisplayProps) {
    return (
        <UnifiedProgressMessage
            isVisible={isVisible}
            logs={logs}
            currentPhase={currentPhase}
            title={title}
        />
    );
}

export function useProgressLog() {
    return {
        registerLogUpdater: () => {},
        updateLog: null
    };
}
