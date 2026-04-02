'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { RetrievalResultData, BookInfo } from '@/src/core/aibot/types';
import BookItem from './BookItem';

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
    // 简化：默认只显示前3本书
    const [showAll, setShowAll] = useState(false);
    
    // 折叠状态管理
    const [isCollapsed, setIsCollapsed] = useState(false);

    const isSelectionMode = mode === 'selection';
    const selectedCount = selectedBookIds.size;

    // 显示逻辑：如果 showAll 为 true，显示所有书，否则只显示前3本
    const displayBooks = showAll
        ? retrievalResult.books
        : retrievalResult.books.slice(0, 3);

    // 处理生成解读 - 简化逻辑
    const handleGenerateInterpretation = () => {
        if (selectedCount > 0) {
            onGenerateInterpretation?.(selectedBookIds);
        } else {
            // 自动筛选相似度>0.42的图书
            const autoSelectedBooks = new Set(
                retrievalResult.books
                    .filter(book => (book.similarityScore || 0) > 0.42)
                    .map(book => book.id)
            );
            onGenerateInterpretation?.(autoSelectedBooks);
        }
    };

    // 自动筛选功能
    const handleAutoSelect = () => {
        const autoSelectedBooks = retrievalResult.books.filter(book =>
            (book.similarityScore || 0) > 0.42
        );
        const autoSelectedIds = new Set(autoSelectedBooks.map(book => book.id));

        autoSelectedIds.forEach(bookId => {
            onSelectionChange?.(bookId, true);
        });
    };

    // 清空选择功能
    const handleClearSelection = () => {
        selectedBookIds.forEach(bookId => {
            onSelectionChange?.(bookId, false);
        });
    };

    // 二次检索功能
    const handleSecondaryRetrieval = () => {
        if (selectedCount === 0) return;

        // 获取选中的图书信息
        const selectedBooks = retrievalResult.books.filter(book =>
            selectedBookIds.has(book.id)
        );

        onSecondaryRetrieval?.(selectedBooks, originalQuery);
    };

    return (
        <div className="retrieval-result-container mb-4">
            {/* 头部 - 可点击折叠 */}
            <motion.div
                className="aibot-workflow-header cursor-pointer"
                onClick={() => setIsCollapsed(!isCollapsed)}
                whileHover={{ backgroundColor: isSelectionMode ? 'rgba(201, 160, 99, 0.18)' : 'rgba(201, 160, 99, 0.14)' }}
                transition={{ duration: 0.2 }}
            >
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative flex h-8 w-8 items-center justify-center rounded-full border border-[#C9A063]/24 bg-[#1A1712]">
                        <div className="absolute inset-0 rounded-full bg-[#C9A063]/10 animate-pulse" />
                        <div className="relative h-2 w-2 rounded-full bg-[#C9A063] shadow-[0_0_18px_rgba(201,160,99,0.4)]"></div>
                    </div>
                    {isSelectionMode ? (
                        <>
                            <div>
                                <span className="block font-info-content text-sm font-medium text-[#F0E4D0]">
                                    请选择相关图书
                                </span>
                                <span className="block pt-1 text-xs text-[#AAA292] font-info-content">
                                    已选择 {selectedCount} 本 · 共 {retrievalResult.books.length} 本可供筛选
                                </span>
                            </div>
                        </>
                    ) : (
                        <div>
                            <span className="block font-info-content text-sm font-medium text-[#F0E4D0]">
                                检索结果
                            </span>
                            <span className="block pt-1 text-xs text-[#AAA292] font-info-content">
                                找到 {retrievalResult.totalCount} 本相关图书
                            </span>
                        </div>
                    )}
                </div>
                <motion.div
                    animate={{ rotate: isCollapsed ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-[#A2A09A] text-lg"
                >
                    ▼
                </motion.div>
            </motion.div>

            {/* 内容 - 可折叠 */}
            <AnimatePresence>
                {!isCollapsed && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                    >
                        <div className="aibot-workflow-card rounded-t-none border-t-0">
                            <div className="aibot-scroll max-h-96 overflow-y-auto px-4 py-4 md:px-5">
                                {displayBooks.length > 0 ? (
                                    displayBooks.map((book, index) => (
                                        <BookItem
                                            key={`${book.id}-${index}`}
                                            book={book}
                                            isCompact={true}
                                            showCheckbox={isSelectionMode}
                                            isSelected={selectedBookIds.has(book.id)}
                                            onSelectionChange={onSelectionChange}
                                        />
                                    ))
                                ) : (
                                    <div className="py-10 text-center">
                                        <p className="text-sm mb-2 text-[#BDB4A6] font-info-content">未找到相关图书</p>
                                        <p className="text-xs text-[#736D62] font-info-content">请尝试调整搜索关键词或搜索条件</p>
                                    </div>
                                )}

                                {/* 显示更多按钮 */}
                                {retrievalResult.books.length > 3 && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowAll(!showAll);
                                        }}
                                        className="aibot-btn aibot-btn--ghost mt-3 w-full"
                                    >
                                        {showAll ? '收起列表' : `显示全部 ${retrievalResult.books.length} 本`}
                                    </button>
                                )}

                                {/* 选择模式下的操作按钮 */}
                                {isSelectionMode && (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <button
                                            onClick={handleGenerateInterpretation}
                                            className="aibot-btn aibot-btn--primary"
                                            disabled={selectedCount === 0 && retrievalResult.books.filter(book => (book.similarityScore || 0) > 0.42).length === 0}
                                        >
                                            生成解读 {selectedCount > 0 && `(${selectedCount}本)`}
                                        </button>
                                        <button
                                            onClick={handleSecondaryRetrieval}
                                            className="aibot-btn aibot-btn--secondary"
                                            disabled={selectedCount === 0}
                                        >
                                            二次检索 {selectedCount > 0 && `(${selectedCount}本)`}
                                        </button>
                                        <button
                                            onClick={handleAutoSelect}
                                            className="aibot-btn aibot-btn--ghost"
                                        >
                                            自动筛选
                                        </button>
                                        <button
                                            onClick={handleClearSelection}
                                            className="aibot-btn aibot-btn--ghost"
                                            disabled={selectedCount === 0}
                                        >
                                            清空选择
                                        </button>
                                    </div>
                                )}

                                {/* 显示模式下的操作按钮 */}
                                {!isSelectionMode && onReenterSelection && (
                                    <button
                                        onClick={onReenterSelection}
                                        className="aibot-btn aibot-btn--secondary mt-4 w-full"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                                            <path d="M4 12a8 8 0 0 1 8-8V0l4 4-4 4V6a6 6 0 1 0 6 6h-2a8 8 0 1 1-8-8z" fill="currentColor" />
                                        </svg>
                                        重新选择图书进行解读
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