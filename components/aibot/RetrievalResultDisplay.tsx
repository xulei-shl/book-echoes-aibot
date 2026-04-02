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
        <div className="retrieval-result-container mb-3">
            {/* 头部 - 可点击折叠 */}
            <motion.div
                className={`retrieval-header flex items-center justify-between p-3 border border-[#C9A063]/20 cursor-pointer ${
                    isSelectionMode
                        ? 'bg-[rgba(201,160,99,0.12)]'
                        : 'bg-[rgba(201,160,99,0.08)]'
                }`}
                onClick={() => setIsCollapsed(!isCollapsed)}
                whileHover={{
                    backgroundColor: isSelectionMode
                        ? 'rgba(201, 160, 99, 0.25)'
                        : 'rgba(201, 160, 99, 0.15)'
                }}
                transition={{ duration: 0.2 }}
            >
                <div className="flex items-center gap-3 flex-wrap">
                    {isSelectionMode ? (
                        <>
                            <span className="text-[#C9A063] text-sm font-medium font-mono tracking-wider">
                                📚 请选择相关图书生成解读或二次检索
                            </span>
                            <span className="text-[#E8E6DC] text-sm font-info-content">
                                已选择 {selectedCount} 本图书
                            </span>
                            {retrievalResult.books.length > 0 && (
                                <span className="text-[#C9A063]/50 text-xs font-mono tracking-wider">
                                    共 {retrievalResult.books.length} 本可供选择
                                </span>
                            )}
                        </>
                    ) : (
                        <>
                            <span className="text-[#C9A063] text-sm font-medium font-mono tracking-wider">
                                📚 检索结果
                            </span>
                            <span className="text-[#E8E6DC] text-sm font-info-content">
                                找到 {retrievalResult.totalCount} 本相关图书
                            </span>
                        </>
                    )}
                </div>
                {/* 折叠指示器 */}
                <motion.div
                    animate={{ rotate: isCollapsed ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-[#C9A063]/70 text-lg"
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
                        <div className="book-list border border-[#C9A063]/20 border-t-0 bg-[rgba(26,26,26,0.8)]">
                            <div className="p-4 max-h-96 overflow-y-auto about-overlay-scroll">
                {displayBooks.length > 0 ? (
                    displayBooks.map((book, index) => (
                        <BookItem
                            key={`${book.id}-${index}`}
                            book={book}
                            isCompact={true}
                            showCheckbox={isSelectionMode} // 只在选择模式下显示复选框
                            isSelected={selectedBookIds.has(book.id)}
                            onSelectionChange={onSelectionChange}
                        />
                    ))
                ) : (
                    <div className="text-center py-8">
                        <p className="text-[#A2A09A] text-sm mb-2">未找到相关图书</p>
                        <p className="text-[#6F6D68] text-xs">请尝试调整搜索关键词或搜索条件</p>
                        {/* 添加调试信息 */}
                        <div className="mt-4 p-2 bg-[#1B1B1B] rounded text-xs text-left">
                            <p className="text-[#6F6D68]">调试信息:</p>
                            <p className="text-[#6F6D68]">总图书数: {retrievalResult.books.length}</p>
                            <p className="text-[#6F6D68]">显示图书数: {displayBooks.length}</p>
                            <p className="text-[#6F6D68]">选择模式: {isSelectionMode ? '是' : '否'}</p>
                            <p className="text-[#6F6D68]">显示全部: {showAll ? '是' : '否'}</p>
                        </div>
                    </div>
                )}

                {/* 显示更多按钮 */}
                {retrievalResult.books.length > 3 && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowAll(!showAll);
                        }}
                        className="w-full py-2 mt-2 text-center text-[#C9A063] text-sm hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors border border-[#C9A063]/20 font-mono tracking-wider"
                    >
                        {showAll ? '▲ 收起' : `▼ 显示全部 ${retrievalResult.books.length} 本`}
                    </button>
                )}

                {/* 选择模式下的操作按钮 */}
                {isSelectionMode && (
                    <div className="selection-actions mt-4 flex flex-wrap gap-3">
                        <div className="relative group">
                            <button
                                onClick={handleGenerateInterpretation}
                                className="px-4 py-2 border border-[#C9A063] bg-[#C9A063] text-[#1a1a1a] text-sm font-mono tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:bg-transparent hover:text-[#C9A063] transition-colors duration-300"
                                disabled={selectedCount === 0 && retrievalResult.books.filter(book => (book.similarityScore || 0) > 0.42).length === 0}
                            >
                                生成解读 {selectedCount > 0 && `(${selectedCount}本)`}
                            </button>
                            <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-[#1a1a1a] text-[#E8E6DC] text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 border border-[#C9A063]/20 max-w-xs min-w-48 font-info-content pointer-events-none">
                                生成选中图书的AI解读，如未选择则自动筛选相似度{'>'}0.42的图书
                                <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-[#C9A063]/20"></div>
                            </div>
                        </div>
                        <div className="relative group">
                            <button
                                onClick={handleSecondaryRetrieval}
                                className="px-4 py-2 border border-[#C9A063]/30 text-[#C9A063] text-sm font-mono tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors duration-300"
                                disabled={selectedCount === 0}
                            >
                                二次检索 {selectedCount > 0 && `(${selectedCount}本)`}
                            </button>
                            <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-[#1a1a1a] text-[#E8E6DC] text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 border border-[#C9A063]/20 max-w-xs min-w-48 font-info-content pointer-events-none">
                                基于选中图书和原始查询进行深度检索分析
                                <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-[#C9A063]/20"></div>
                            </div>
                        </div>
                        <div className="relative group">
                            <button
                                onClick={handleAutoSelect}
                                className="px-4 py-2 border border-[#C9A063]/20 text-[#E8E6DC] text-sm font-mono tracking-wider hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors duration-300"
                            >
                                自动筛选
                            </button>
                            <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-[#1a1a1a] text-[#E8E6DC] text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 border border-[#C9A063]/20 max-w-xs min-w-48 font-info-content pointer-events-none">
                                自动选择相似度{'>'}0.42的高相关度图书
                                <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-[#C9A063]/20"></div>
                            </div>
                        </div>
                        <button
                            onClick={handleClearSelection}
                            className="px-4 py-2 border border-[#C9A063]/20 text-[#C9A063]/70 text-sm font-mono tracking-wider hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
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
                        className="w-full py-2 mt-3 text-center text-[#C9A063] text-sm hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors border border-[#C9A063]/20 flex items-center justify-center gap-2 font-mono tracking-wider"
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