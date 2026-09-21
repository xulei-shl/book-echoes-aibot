'use client';

import { useState } from 'react';
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
    const [showAll, setShowAll] = useState(false);
    const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());

    // 报告开始生成时默认折叠；用户手动展开/收起后以用户选择为准（避免在 effect 中回写状态）
    const [userExpanded, setUserExpanded] = useState<boolean | null>(null);
    const isExpanded = userExpanded ?? !autoCollapseOnReportStart;
    const toggleExpanded = () => setUserExpanded(prev => !(prev ?? !autoCollapseOnReportStart));

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
                className="flex items-center justify-between p-3 rounded-t-xl border border-[#343434] bg-[rgba(201,160,99,0.15)] cursor-pointer"
                onClick={toggleExpanded}
                whileHover={{ backgroundColor: 'rgba(201, 160, 99, 0.2)' }}
                transition={{ duration: 0.2 }}
            >
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[#C9A063] text-sm font-medium font-body">
                        📚 相关图书
                    </span>
                    <span className="text-[#E8E6DC] text-sm font-body">
                        找到 {books.length} 本
                    </span>
                    {selectedCount > 0 && (
                        <span className="text-xs px-2 py-0.5 bg-[#C9A063]/20 text-[#C9A063] rounded font-body">
                            已选 {selectedCount} 本
                        </span>
                    )}
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
                        <div className="border border-[#343434] border-t-0 rounded-b-xl bg-[rgba(26,26,26,0.8)]">
                            {/* 图书列表 */}
                            <div className="p-4 max-h-96 overflow-y-auto aibot-scroll">
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
                                    <div className="text-center py-8">
                                        <p className="text-[#A2A09A] text-sm font-body">未找到相关图书</p>
                                        <p className="text-[#6F6D68] text-xs mt-1 font-body">请尝试调整搜索条件</p>
                                    </div>
                                )}

                                {/* 显示更多按钮 */}
                                {books.length > 3 && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowAll(!showAll);
                                        }}
                                        className="w-full py-2 mt-2 text-center text-[#C9A063] text-sm hover:bg-[#1B1B1B] rounded-lg transition-colors border border-[#343434] font-body"
                                    >
                                        {showAll ? '▲ 收起' : `▼ 显示全部 ${books.length} 本`}
                                    </button>
                                )}
                            </div>

                            {/* 操作按钮 */}
                            {books.length > 0 && (
                                <div className="p-4 border-t border-[#343434] flex flex-wrap gap-3">
                                    <div className="relative group">
                                        <button
                                            onClick={handleGenerateInterpretation}
                                            disabled={isLoading || (selectedCount === 0 && books.filter(b => (b.similarityScore || 0) > 0.42).length === 0)}
                                            className="px-4 py-2 bg-[#C9A063] text-black rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#D4A863] transition-colors font-body"
                                        >
                                            {isLoading ? '生成中...' : `生成解读 ${selectedCount > 0 ? `(${selectedCount}本)` : ''}`}
                                        </button>
                                        <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-[#1B1B1B] text-[#E8E6DC] text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 border border-[#343434] shadow-lg max-w-xs min-w-48 font-body pointer-events-none">
                                            生成选中图书的AI解读，如未选择则自动筛选相似度{'>'}0.42的图书
                                        </div>
                                    </div>

                                    {/* 新增：二次检索按钮 */}
                                    <div className="relative group">
                                        <button
                                            onClick={handleSecondaryRetrieval}
                                            disabled={isLoading || books.length === 0 || !onSecondaryRetrieval}
                                            className="px-4 py-2 border border-[#343434] text-[#E8E6DC] rounded-lg text-sm hover:bg-[#1B1B1B] transition-colors font-body disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            二次检索 {selectedCount > 0 ? `(${selectedCount}本)` : `(${books.length}本)`}
                                        </button>
                                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-[#1B1B1B] text-[#E8E6DC] text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 border border-[#343434] shadow-lg max-w-xs min-w-48 font-body pointer-events-none">
                                            基于选中图书进行二次检索，切换到简单检索模式
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleAutoSelect}
                                        className="px-4 py-2 border border-[#343434] text-[#E8E6DC] rounded-lg text-sm hover:bg-[#1B1B1B] transition-colors font-body"
                                    >
                                        自动筛选
                                    </button>

                                    <button
                                        onClick={handleClearSelection}
                                        disabled={selectedCount === 0}
                                        className="px-4 py-2 border border-[#343434] text-[#A2A09A] rounded-lg text-sm hover:bg-[#1B1B1B] transition-colors disabled:opacity-50 font-body"
                                    >
                                        清空选择
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
