'use client';

import UnifiedProgressMessage from './messages/UnifiedProgressMessage';
import type { DeepSearchLogEntry } from '@/src/core/aibot/types';

interface DeepSearchProgressMessageProps {
    logs: DeepSearchLogEntry[];
    title?: string;
}

export default function DeepSearchProgressMessage({
    logs,
    title = '深度检索进度'
}: DeepSearchProgressMessageProps) {
    return <UnifiedProgressMessage logs={logs} title={title} />;
}
