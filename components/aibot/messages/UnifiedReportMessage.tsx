'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { messageMarkdownComponents } from '@/lib/markdownComponents';
import type { BookInfo } from '@/src/core/aibot/types';

// 清理 markdown 代码块包裹
const cleanMarkdownCodeBlock = (content: string): string => {
    const openingFencePattern = /^```(?:markdown|md)?\s*\n?/i;
    const closingFencePattern = /\n?```\s*$/;

    if (!openingFencePattern.test(content)) {
        return content;
    }

    let normalizedContent = content.replace(openingFencePattern, '');
    if (closingFencePattern.test(normalizedContent)) {
        normalizedContent = normalizedContent.replace(closingFencePattern, '');
    }

    return normalizedContent;
};

export interface UnifiedReportMessageProps {
    reportMarkdown: string;
    isStreaming?: boolean;
    isComplete?: boolean;
    selectedBooks?: BookInfo[];
    onSecondaryRetrieval?: (selectedBooks: BookInfo[], query: string) => void;
}

export default function UnifiedReportMessage({
    reportMarkdown,
    isStreaming = false,
    selectedBooks = [],
    onSecondaryRetrieval
}: UnifiedReportMessageProps) {
    const [copied, setCopied] = useState(false);
    const cleanedReport = cleanMarkdownCodeBlock(reportMarkdown || '');

    const handleCopy = async () => {
        if (!cleanedReport) return;
        try {
            await navigator.clipboard.writeText(cleanedReport);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // ignore clipboard errors
        }
    };

    return (
        <div className="bg-[#1a1a1a]/85 border border-[#C9A063]/25 p-4 rounded-none backdrop-blur-sm space-y-3">
            {/* 顶栏微型工具条 */}
            <div className="flex items-center justify-between border-b border-[#C9A063]/15 pb-2">
                <div className="flex items-center gap-2 text-xs font-mono tracking-wider text-[#C9A063]">
                    <span>📖 深度解读报告</span>
                    {selectedBooks.length > 0 && (
                        <span className="text-[#A2A09A]">
                            （基于 {selectedBooks.map((b) => `《${b.title}》`).join('、')}）
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {cleanedReport && !isStreaming && (
                        <button
                            type="button"
                            onClick={handleCopy}
                            className="text-[11px] font-mono tracking-wider text-[#A2A09A] hover:text-[#C9A063] transition-colors px-2 py-0.5 border border-[#C9A063]/20 hover:border-[#C9A063]/50"
                        >
                            {copied ? '✓ 已复制' : '复制全文'}
                        </button>
                    )}
                </div>
            </div>

            {/* Markdown 正文 */}
            <div
                className="prose prose-invert prose-sm max-w-none font-info-content text-[#E8E6DC] leading-relaxed"
                suppressHydrationWarning
            >
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={messageMarkdownComponents}
                >
                    {cleanedReport}
                </ReactMarkdown>
                {isStreaming && (
                    <span className="inline-block w-2 h-4 bg-[#C9A063] animate-pulse ml-1 align-middle"></span>
                )}
            </div>

            {/* 底栏拓展行动项 */}
            {!isStreaming && selectedBooks.length > 0 && onSecondaryRetrieval && (
                <div className="pt-2 border-t border-[#C9A063]/15 flex justify-end">
                    <button
                        type="button"
                        onClick={() => onSecondaryRetrieval(selectedBooks, '')}
                        className="text-xs font-mono tracking-wider text-[#C9A063]/80 hover:text-[#C9A063] hover:underline"
                    >
                        🔍 基于本报告选书延伸二次检索 →
                    </button>
                </div>
            )}
        </div>
    );
}
