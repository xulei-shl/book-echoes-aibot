'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BookItem from '../BookItem';
import type { BookInfo } from '@/src/core/aibot/types';

export interface UnifiedBookSelectionProps {
    books: BookInfo[];
    selectedBookIds?: Set<string>;
    userInput?: string;
    draftMarkdown?: string;
    mode?: 'display' | 'selection';
    title?: string;
    isLoading?: boolean;
    autoCollapseOnReportStart?: boolean;
    onBookSelectionChange?: (bookId: string, isSelected: boolean) => void;
    onSelectionBatchChange?: (selectedBooks: BookInfo[], selectedIds: Set<string>) => void;
    onGenerateInterpretation?: (selectedBooks: BookInfo[], draftOrQuery?: string) => void;
    onSecondaryRetrieval?: (selectedBooks: BookInfo[], query: string) => void;
    onReenterSelection?: () => void;
}

export default function UnifiedBookSelection({
    books = [],
    selectedBookIds: externalSelectedBookIds,
    userInput = '',
    draftMarkdown = '',
    mode = 'selection',
    title = '相关图书',
    isLoading = false,
    autoCollapseOnReportStart = false,
    onBookSelectionChange,
    onSelectionBatchChange,
    onGenerateInterpretation,
    onSecondaryRetrieval,
    onReenterSelection
}: UnifiedBookSelectionProps) {
    const [localSelectedIds, setLocalSelectedIds] = useState<Set<string>>(new Set());
    const [showAll, setShowAll] = useState(false);
    const [userExpanded, setUserExpanded] = useState<boolean | null>(null);

    // 受控与非受控并存模式：当父组件传入 externalSelectedBookIds 且有变更回调时受控，否则由内部 localSelectedIds 自主维护
    const isControlled = externalSelectedBookIds !== undefined && onBookSelectionChange !== undefined;
    const selectedIds = isControlled ? externalSelectedBookIds : localSelectedIds;
    const isSelectionMode = mode === 'selection';

    // 报告开始生成时默认折叠；用户手动展开/收起后以用户选择为准
    const isExpanded = userExpanded ?? !autoCollapseOnReportStart;
    const toggleExpanded = () => setUserExpanded((prev) => !(prev ?? !autoCollapseOnReportStart));

    const displayBooks = showAll ? books : books.slice(0, 3);
    const selectedCount = selectedIds.size;

    const handleBookSelect = (bookId: string, isSelected: boolean) => {
        const next = new Set(selectedIds);
        if (isSelected) {
            next.add(bookId);
        } else {
            next.delete(bookId);
        }
        setLocalSelectedIds(next);

        onBookSelectionChange?.(bookId, isSelected);
        const selectedBooks = books.filter((b) => next.has(b.id));
        onSelectionBatchChange?.(selectedBooks, next);
    };

    // 计算高相关度图书数量 (similarityScore > 0.42) 或兜底前 3 本
    const highRelevanceCount = books.filter((b) => (b.similarityScore || 0) > 0.42).length;
    const autoSelectCount = highRelevanceCount > 0 ? highRelevanceCount : Math.min(3, books.length);

    // 自动筛选高相关度图书
    const handleAutoSelect = () => {
        const highRelevance = books.filter((b) => (b.similarityScore || 0) > 0.42);
        const targetBooks = highRelevance.length > 0 ? highRelevance : books.slice(0, Math.min(3, books.length));
        const autoSelectedIds = new Set(targetBooks.map((b) => b.id));
        setLocalSelectedIds(autoSelectedIds);

        books.forEach((b) => onBookSelectionChange?.(b.id, autoSelectedIds.has(b.id)));
        onSelectionBatchChange?.(targetBooks, autoSelectedIds);
    };

    // 清空选择
    const handleClearSelection = () => {
        const cleared = new Set<string>();
        setLocalSelectedIds(cleared);

        selectedIds.forEach((id) => onBookSelectionChange?.(id, false));
        onSelectionBatchChange?.([], cleared);
    };

    // 触发解读生成
    const handleGenerateInterpretation = () => {
        let finalBooks = books.filter((b) => selectedIds.has(b.id));
        if (finalBooks.length === 0) {
            // 没有手动选书时，自动筛选高相关度图书
            finalBooks = books.filter((b) => (b.similarityScore || 0) > 0.42);
            if (finalBooks.length === 0 && books.length > 0) {
                finalBooks = [books[0]];
            }
        }
        onGenerateInterpretation?.(finalBooks, draftMarkdown || userInput);
    };

    // 二次检索
    const handleSecondaryRetrieval = () => {
        if (selectedCount === 0) return;
        const finalBooks = books.filter((b) => selectedIds.has(b.id));

        if (finalBooks.length > 0 && onSecondaryRetrieval) {
            onSecondaryRetrieval(finalBooks, userInput);
        }
    };

    return (
        <div className="mb-4">
            {/* 列表头部 */}
            <motion.div
                className={`flex items-center justify-between p-3 border border-[#C9A063]/30 cursor-pointer gap-2.5 ${
                    isSelectionMode ? 'bg-[#1a1a1a]/95' : 'bg-[#1a1a1a]/85'
                }`}
                onClick={toggleExpanded}
                whileHover={{ backgroundColor: 'rgba(26, 26, 26, 0.98)' }}
                transition={{ duration: 0.2 }}
            >
                <div className="flex items-center gap-3 min-w-0 flex-wrap">
                    <span className="text-[#C9A063] text-sm font-medium font-mono tracking-wider shrink-0 whitespace-nowrap">
                        📚 {title} ({books.length} 本)
                    </span>
                    {isSelectionMode && (
                        <span className={`text-xs font-mono tracking-wider shrink-0 whitespace-nowrap ${
                            selectedCount > 0 ? 'text-[#C9A063] font-semibold' : 'text-[#A2A09A]'
                        }`}>
                            已选 {selectedCount} 本
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {/* 折叠箭头 */}
                    <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-[#A2A09A] shrink-0"
                    >
                        ▼
                    </motion.div>
                </div>
            </motion.div>

            {/* 列表主体内容 */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                    >
                        <div className="border border-[#C9A063]/30 border-t-0 bg-[#1a1a1a]/90 backdrop-blur-xl p-4">
                            {/* 工具栏：快捷筛选与清空 */}
                            {isSelectionMode && (
                                <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#C9A063]/20 flex-wrap gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <button
                                            type="button"
                                            onClick={handleAutoSelect}
                                            className="px-2.5 py-1 text-xs font-mono tracking-wider border border-[#C9A063]/40 text-[#C9A063] hover:bg-[#C9A063]/10 active:scale-[0.96] transition-all shrink-0 whitespace-nowrap"
                                            title="自动筛选高相关度图书"
                                        >
                                            ⚡ 智能优选 ({autoSelectCount})
                                        </button>
                                        {selectedCount > 0 && (
                                            <button
                                                type="button"
                                                onClick={handleClearSelection}
                                                className="px-2.5 py-1 text-xs font-mono tracking-wider border border-[#A2A09A]/30 text-[#A2A09A] hover:text-[#E8E6DC] active:scale-[0.96] transition-all shrink-0 whitespace-nowrap"
                                            >
                                                清空选择
                                            </button>
                                        )}
                                    </div>
                                    <div className="text-xs text-[#A2A09A] font-mono">
                                        点击卡片勾选深入解读或二次检索图书
                                    </div>
                                </div>
                            )}

                            {/* 图书卡片列表 */}
                            <div className="space-y-1">
                                {displayBooks.map((book) => (
                                    <BookItem
                                        key={book.id}
                                        book={book}
                                        isSelected={selectedIds.has(book.id)}
                                        onSelectionChange={handleBookSelect}
                                        disabled={isLoading}
                                        showCheckbox={isSelectionMode}
                                    />
                                ))}
                            </div>

                            {/* 显示全部 / 收起控制 */}
                            {books.length > 3 && (
                                <div className="mt-3 text-center">
                                    <button
                                        type="button"
                                        onClick={() => setShowAll(!showAll)}
                                        className="text-xs text-[#C9A063] hover:text-[#D4AF37] font-mono tracking-wider py-1 px-3 border border-[#C9A063]/20 hover:border-[#C9A063]/50 transition-colors"
                                    >
                                        {showAll ? '收起多余图书 ▲' : `展开全部 ${books.length} 本图书 ▼`}
                                    </button>
                                </div>
                            )}

                            {/* 底部操作栏 */}
                            <div className="mt-4 pt-3 border-t border-[#C9A063]/20 flex items-center justify-between flex-wrap gap-2.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                    {onSecondaryRetrieval && (
                                        <button
                                            type="button"
                                            onClick={handleSecondaryRetrieval}
                                            disabled={isLoading || selectedCount === 0}
                                            title={selectedCount === 0 ? '请先勾选需要二次检索的图书' : `基于选中的 ${selectedCount} 本图书进行二次检索`}
                                            className="px-3.5 py-1.5 border border-[#C9A063]/50 text-[#C9A063] hover:bg-[#C9A063]/15 active:scale-[0.96] text-xs font-mono tracking-wider transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                                        >
                                            <span>🔍 基于选书二次检索</span>
                                            {selectedCount > 0 ? (
                                                <span className="px-1.5 py-0.2 bg-[#C9A063]/25 border border-[#C9A063]/40 rounded text-[#E8E6DC] text-[11px] font-semibold tabular-nums">
                                                    {selectedCount}本
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-[#A2A09A] font-normal">(请先勾选)</span>
                                            )}
                                        </button>
                                    )}
                                    {!isSelectionMode && onReenterSelection && (
                                        <button
                                            type="button"
                                            onClick={onReenterSelection}
                                            className="px-3 py-1.5 border border-[#A2A09A]/40 text-[#A2A09A] hover:text-[#E8E6DC] text-xs font-mono tracking-wider transition-colors shrink-0 whitespace-nowrap"
                                        >
                                            重新勾选图书
                                        </button>
                                    )}
                                </div>

                                {isSelectionMode && onGenerateInterpretation && (
                                    <button
                                        type="button"
                                        onClick={handleGenerateInterpretation}
                                        disabled={isLoading}
                                        className="px-4 py-1.5 bg-[#C9A063] text-[#1a1a1a] font-medium text-xs font-mono tracking-wider hover:bg-[#D4AF37] active:scale-[0.96] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                                    >
                                        {isLoading ? (
                                            <>
                                                <span className="w-2.5 h-2.5 border border-[#1a1a1a] border-t-transparent animate-spin inline-block shrink-0"></span>
                                                <span>正在生成解读...</span>
                                            </>
                                        ) : selectedCount > 0 ? (
                                            `生成深度解读 (${selectedCount}本) →`
                                        ) : (
                                            '智能优选并生成解读 →'
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
