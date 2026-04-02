'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BookItem from './BookItem';
import type { BookInfo } from '@/src/core/aibot/types';

interface DeepSearchBookListMessageProps {
    books: BookInfo[];
    draftMarkdown: string;
    userInput: string;
    onBookSelection?: (selectedBooks: BookInfo[]) => void;
    onGenerateInterpretation?: (selectedBooks: BookInfo[], draftMarkdown: string) => void;
    onSecondaryRetrieval?: (selectedBooks: BookInfo[], query: string) => void; // 新增：二次检索回调
    isLoading?: boolean;
    // 新增：当报告开始生成时自动折叠
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
    const [isExpanded, setIsExpanded] = useState(true);
    const [showAll, setShowAll] = useState(false);
    const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());

    // 当报告开始生成时自动折叠
    useEffect(() => {
        if (autoCollapseOnReportStart) {
            setIsExpanded(false);
        }
    }, [autoCollapseOnReportStart]);

    // 显示的图书列表
    const displayBooks = showAll ? books : books.slice(0, 3);
    const selectedCount = selectedBookIds.size;

    // 处理单本图书选择
    const handleBookSelect = (bookId: string, isSelected: boolean) => {
        const newSelection = new Set(selectedBookIds);
        if (isSelected) {
            newSelection.add(bookId);
        } else {
            newSelection.delete(bookId);
        }
        setSelectedBookIds(newSelection);

        // 通知父组件选择变化
        const selectedBooks = books.filter(book => newSelection.has(book.id));
        onBookSelection?.(selectedBooks);
    };

    // 自动筛选高相关度图书
    const handleAutoSelect = () => {
        const autoSelectedIds = new Set(
            books
                .filter(book => (book.similarityScore || 0) > 0.42)
                .map(book => book.id)
        );
        setSelectedBookIds(autoSelectedIds);

        const selectedBooks = books.filter(book => autoSelectedIds.has(book.id));
        onBookSelection?.(selectedBooks);
    };

    // 清空选择
    const handleClearSelection = () => {
        setSelectedBookIds(new Set());
        onBookSelection?.([]);
    };

    // 生成解读
    const handleGenerateInterpretation = () => {
        if (selectedCount === 0) {
            // 如果没有选择，自动筛选后生成
            const autoSelectedBooks = books.filter(book => (book.similarityScore || 0) > 0.42);
            if (autoSelectedBooks.length > 0) {
                onGenerateInterpretation?.(autoSelectedBooks, draftMarkdown);
            }
        } else {
            const selectedBooks = books.filter(book => selectedBookIds.has(book.id));
            onGenerateInterpretation?.(selectedBooks, draftMarkdown);
        }
    };

    // 新增：二次检索
    const handleSecondaryRetrieval = () => {
        const selectedBooks = selectedCount > 0
            ? books.filter(book => selectedBookIds.has(book.id))
            : books; // 如果没有选择，使用所有图书

        if (selectedBooks.length > 0 && onSecondaryRetrieval) {
            onSecondaryRetrieval(selectedBooks, userInput);
        }
    };

    return (
        <div className="mb-4">
            {/* 头部 */}
            <motion.div
                className="aibot-workflow-header cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
                whileHover={{ backgroundColor: 'rgba(201, 160, 99, 0.16)' }}
                transition={{ duration: 0.2 }}
            >
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative flex h-8 w-8 items-center justify-center rounded-full border border-[#C9A063]/24 bg-[#1A1712]">
                        <div className="absolute inset-0 rounded-full bg-[#C9A063]/10 animate-pulse" />
                        <div className="relative h-2 w-2 rounded-full bg-[#C9A063] shadow-[0_0_18px_rgba(201,160,99,0.4)]"></div>
                    </div>
                    <div>
                        <span className="block font-info-content text-sm font-medium text-[#F0E4D0]">
                            相关图书
                        </span>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <span className="aibot-chip">共 {books.length} 本</span>
                            {selectedCount > 0 && <span className="aibot-chip aibot-chip--active">已选 {selectedCount} 本</span>}
                        </div>
                    </div>
                </div>
                <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-[#A2A09A]"
                >
                    ▼
                </motion.div>
            </motion.div>

            {/* 内容 */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                    >
                        <div className="aibot-workflow-card rounded-t-none border-t-0">
                            {/* 图书列表 */}
                            <div className="aibot-scroll max-h-96 overflow-y-auto px-4 py-4 md:px-5">
                                {displayBooks.length > 0 ? (
                                    displayBooks.map((book, index) => (
                                        <BookItem
                                            key={`${book.id}-${index}`}
                                            book={book}
                                            isCompact={true}
                                            showCheckbox={true}
                                            isSelected={selectedBookIds.has(book.id)}
                                            onSelectionChange={handleBookSelect}
                                        />
                                    ))
                                ) : (
                                    <div className="py-8 text-center">
                                        <p className="text-sm text-[#BDB4A6] font-info-content">未找到相关图书</p>
                                        <p className="mt-1 text-xs text-[#736D62] font-info-content">请尝试调整搜索条件</p>
                                    </div>
                                )}

                                {/* 显示更多按钮 */}
                                {books.length > 3 && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowAll(!showAll);
                                        }}
                                        className="aibot-btn aibot-btn--ghost mt-3 w-full"
                                    >
                                        {showAll ? '收起列表' : `显示全部 ${books.length} 本`}
                                    </button>
                                )}
                            </div>

                            {/* 操作按钮 */}
                            {books.length > 0 && (
                                <div className="aibot-workflow-footer">
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={handleGenerateInterpretation}
                                            disabled={isLoading || (selectedCount === 0 && books.filter(b => (b.similarityScore || 0) > 0.42).length === 0)}
                                            className="aibot-btn aibot-btn--primary"
                                        >
                                            {isLoading ? '生成中...' : `生成解读 ${selectedCount > 0 ? `(${selectedCount}本)` : ''}`}
                                        </button>

                                        <button
                                            onClick={handleSecondaryRetrieval}
                                            disabled={isLoading || books.length === 0 || !onSecondaryRetrieval}
                                            className="aibot-btn aibot-btn--secondary"
                                        >
                                            二次检索 {selectedCount > 0 ? `(${selectedCount}本)` : `(${books.length}本)`}
                                        </button>

                                        <button
                                            onClick={handleAutoSelect}
                                            className="aibot-btn aibot-btn--ghost"
                                        >
                                            自动筛选
                                        </button>

                                        <button
                                            onClick={handleClearSelection}
                                            disabled={selectedCount === 0}
                                            className="aibot-btn aibot-btn--ghost"
                                        >
                                            清空选择
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
