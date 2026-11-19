'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
    error?: string;
    onRetry?: () => void;
    onSecondaryRetrieval?: (selectedBooks: BookInfo[], query: string) => void;
}

export default function UnifiedReportMessage({
    reportMarkdown,
    isStreaming = false,
    selectedBooks = [],
    error,
    onRetry,
    onSecondaryRetrieval
}: UnifiedReportMessageProps) {
    const [copied, setCopied] = useState(false);
    const [isBooksExpanded, setIsBooksExpanded] = useState(false);
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

    // 错误态原地反馈与就地重试
    if (error) {
        return (
            <div className="bg-[#1a1a1a]/95 border border-[#C76B6B]/40 p-4 rounded-none backdrop-blur-sm space-y-3">
                <div className="flex items-center justify-between border-b border-[#C76B6B]/20 pb-2.5 flex-wrap gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                        <span className="text-xs font-mono font-medium tracking-wider text-[#C76B6B] shrink-0 whitespace-nowrap">
                            ⚠️ 深度解读生成未完成
                        </span>
                        {selectedBooks.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setIsBooksExpanded(!isBooksExpanded)}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono tracking-wider text-[#E8E6DC] bg-[#C76B6B]/15 hover:bg-[#C76B6B]/25 border border-[#C76B6B]/40 transition-colors shrink-0"
                                title="点击展开/收起参考图书清单"
                            >
                                <span>📚 参考图书 ({selectedBooks.length}本)</span>
                                <span className="text-[9px] shrink-0">{isBooksExpanded ? '▲' : '▼'}</span>
                            </button>
                        )}
                    </div>

                    {onRetry && (
                        <button
                            type="button"
                            onClick={onRetry}
                            className="text-xs font-mono tracking-wider text-[#E8E6DC] bg-[#C76B6B]/15 hover:bg-[#C76B6B]/25 active:scale-[0.96] transition-all px-2.5 py-1 border border-[#C76B6B]/40 hover:border-[#C76B6B]/60 flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                        >
                            <span>↻</span>
                            <span>重新生成解读</span>
                        </button>
                    )}
                </div>

                {/* 错误态下展开图书清单 */}
                <AnimatePresence>
                    {isBooksExpanded && selectedBooks.length > 0 && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden border-b border-[#C76B6B]/20 pb-2.5"
                        >
                            <div className="pt-1 text-xs font-mono space-y-1.5">
                                <div className="text-[#A2A09A] text-[11px]">
                                    选定的参考图书（共 {selectedBooks.length} 本）：
                                </div>
                                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto about-overlay-scroll pr-1">
                                    {selectedBooks.map((b, idx) => (
                                        <span
                                            key={b.id || `err-book-${idx}`}
                                            className="px-2 py-0.5 text-xs font-mono text-[#E8E6DC] bg-[#141312]/80 border border-[#C76B6B]/30"
                                        >
                                            《{b.title}》
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="text-xs font-info-content text-[#E58585] leading-relaxed py-1 space-y-1">
                    <p className="font-mono text-[#E58585]">{error}</p>
                    <p className="text-[11px] text-[#A2A09A]">
                        未能完成本轮报告撰写，您可以点击上方按钮就地重试，或调整勾选的图书后重新生成。
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-[#1a1a1a]/85 border border-[#C9A063]/25 p-4 rounded-none backdrop-blur-sm space-y-3">
            {/* 顶栏微型工具条 */}
            <div className="flex items-center justify-between border-b border-[#C9A063]/15 pb-2.5 flex-wrap gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                    <span className="text-xs font-mono font-medium tracking-wider text-[#C9A063] shrink-0 whitespace-nowrap">
                        📖 深度解读报告
                    </span>
                    {selectedBooks.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setIsBooksExpanded(!isBooksExpanded)}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono tracking-wider text-[#A2A09A] hover:text-[#C9A063] bg-[#C9A063]/5 hover:bg-[#C9A063]/10 border border-[#C9A063]/25 hover:border-[#C9A063]/50 transition-colors shrink-0"
                            title="点击展开/收起研读图书清单"
                        >
                            <span>📚 参考图书 ({selectedBooks.length}本)</span>
                            <span className="text-[9px] shrink-0 text-[#C9A063]/70">{isBooksExpanded ? '▲' : '▼'}</span>
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {cleanedReport && !isStreaming && (
                        <button
                            type="button"
                            onClick={handleCopy}
                            className={`text-[11px] font-mono tracking-wider transition-colors px-2.5 py-1 border shrink-0 whitespace-nowrap active:scale-[0.96] ${
                                copied
                                    ? 'text-[#C9A063] border-[#C9A063]/60 bg-[#C9A063]/10'
                                    : 'text-[#A2A09A] hover:text-[#C9A063] border-[#C9A063]/20 hover:border-[#C9A063]/50 bg-transparent'
                            }`}
                        >
                            {copied ? '✓ 已复制全文' : '复制全文'}
                        </button>
                    )}
                </div>
            </div>

            {/* 可展开的参考图书清单抽屉 */}
            <AnimatePresence>
                {isBooksExpanded && selectedBooks.length > 0 && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-b border-[#C9A063]/15 pb-3"
                    >
                        <div className="pt-2 text-xs font-mono space-y-2">
                            <div className="flex items-center justify-between text-[#A2A09A]">
                                <span className="text-[#C9A063]/90 font-medium">
                                    📚 报告研读与交叉分析参考图书（共 {selectedBooks.length} 本）：
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setIsBooksExpanded(false)}
                                    className="text-[11px] text-[#A2A09A] hover:text-[#C9A063] transition-colors"
                                >
                                    收起 ▲
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto about-overlay-scroll pr-1">
                                {selectedBooks.map((b, idx) => (
                                    <span
                                        key={b.id || `book-${idx}`}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono text-[#E8E6DC] bg-[#141312]/80 border border-[#C9A063]/25 hover:border-[#C9A063]/50 transition-colors"
                                        title={b.author ? `${b.title} · ${b.author}` : b.title}
                                    >
                                        <span>《{b.title}》</span>
                                        {b.author && (
                                            <span className="text-[#A2A09A] text-[10px]">
                                                ({b.author})
                                            </span>
                                        )}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Markdown 正文 */}
            <div
                className="prose prose-invert prose-sm max-w-none font-info-content text-[#E8E6DC] leading-relaxed break-words"
                suppressHydrationWarning
            >
                {cleanedReport ? (
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={messageMarkdownComponents}
                    >
                        {cleanedReport}
                    </ReactMarkdown>
                ) : isStreaming ? (
                    <div className="flex items-center gap-2 text-xs font-mono text-[#C9A063]/70 tracking-wider py-1">
                        <span className="w-2.5 h-2.5 border border-[#C9A063] border-t-transparent animate-spin inline-block shrink-0"></span>
                        <span>正在研读选定图书并撰写深度解读报告...</span>
                    </div>
                ) : null}
                {isStreaming && cleanedReport && (
                    <span className="inline-block w-2 h-4 bg-[#C9A063] animate-pulse ml-1 align-middle"></span>
                )}
            </div>

            {/* 底栏拓展行动项 */}
            {!isStreaming && selectedBooks.length > 0 && onSecondaryRetrieval && (
                <div className="pt-3 border-t border-[#C9A063]/15 flex items-center justify-end">
                    <button
                        type="button"
                        onClick={() => onSecondaryRetrieval(selectedBooks, '')}
                        className="px-3 py-1.5 border border-[#C9A063]/40 text-[#C9A063] hover:bg-[#C9A063]/15 active:scale-[0.96] text-xs font-mono tracking-wider transition-all duration-150 flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                    >
                        <span>🔍 基于本报告选书延伸二次检索</span>
                        <span className="px-1.5 py-0.2 bg-[#C9A063]/25 border border-[#C9A063]/40 rounded text-[#E8E6DC] text-[11px] font-semibold tabular-nums">
                            {selectedBooks.length}本
                        </span>
                        <span>→</span>
                    </button>
                </div>
            )}
        </div>
    );
}
