'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { RetrievalResultData } from '@/src/core/aibot/types';
import BookItem from './BookItem';

export default function RetrievalResultDisplay({
    retrievalResult,
    mode = 'display',
    selectedBookIds = new Set(),
    onSelectionChange,
    onGenerateInterpretation,
    onCancelSelection,
    onReenterSelection
}: {
    retrievalResult: RetrievalResultData;
    mode?: 'display' | 'selection';
    selectedBookIds?: Set<string>;
    onSelectionChange?: (bookId: string, isSelected: boolean) => void;
    onGenerateInterpretation?: (selectedBookIds: Set<string>) => void;
    onCancelSelection?: () => void;
    onReenterSelection?: () => void;
}) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [showAll, setShowAll] = useState(false);

    const isSelectionMode = mode === 'selection';
    
    // 选择模式下显示所有图书，非选择模式下默认显示3本
    const displayBooks = isSelectionMode || showAll
        ? retrievalResult.books
        : retrievalResult.books.slice(0, 3);
    const selectedCount = selectedBookIds.size;

    // 处理生成解读
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

    return (
        <div className="retrieval-result-container mb-3">
            {/* 折叠头部 */}
            <motion.div
                className={`retrieval-header flex items-center justify-between p-3 cursor-pointer rounded-t-xl border border-[#343434] border-b-0 ${
                    isSelectionMode
                        ? 'bg-[rgba(201,160,99,0.2)]'
                        : 'bg-[rgba(201,160,99,0.1)]'
                }`}
                onClick={() => setIsCollapsed(!isCollapsed)}
                whileHover={{ backgroundColor: 'rgba(201, 160, 99, 0.3)' }}
                transition={{ duration: 0.2 }}
            >
                <div className="flex items-center gap-3 flex-wrap">
                    {isSelectionMode ? (
                        <>
                            <span className="text-[#C9A063] text-sm font-medium">
                                📚 请选择相关图书进行解读
                            </span>
                            <span className="text-[#E8E6DC] text-sm">
                                已选择 {selectedCount} 本图书
                            </span>
                            {retrievalResult.books.length > 0 && (
                                <span className="text-[#6F6D68] text-xs">
                                    共 {retrievalResult.books.length} 本可供选择
                                </span>
                            )}
                        </>
                    ) : (
                        <>
                            <span className="text-[#C9A063] text-sm font-medium">
                                {retrievalResult.searchType === 'text-search' ? '📚 简单检索' : '🔍 深度检索'}
                            </span>
                            <span className="text-[#E8E6DC] text-sm">
                                找到 {retrievalResult.totalCount} 本相关图书
                            </span>
                            <span className="text-[#6F6D68] text-xs">
                                检索词: "{retrievalResult.searchQuery.slice(0, 20)}{retrievalResult.searchQuery.length > 20 ? '...' : ''}"
                            </span>
                        </>
                    )}
                </div>
                <motion.div
                    animate={{ rotate: isCollapsed ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-[#A2A09A]"
                >
                    ▼
                </motion.div>
            </motion.div>

            {/* 可折叠内容 */}
            <AnimatePresence>
                {!isCollapsed && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                    >
                        <div className="book-list p-4 border border-[#343434] border-t-0 rounded-b-xl bg-[rgba(26,26,26,0.8)] max-h-96 overflow-y-auto">
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
                            
                            {/* 选择模式下的操作按钮 */}
                            {isSelectionMode && (
                                <div className="selection-actions mt-4 flex flex-wrap gap-3">
                                    <button
                                        onClick={handleGenerateInterpretation}
                                        className="px-4 py-2 bg-[#C9A063] text-black rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                        disabled={selectedCount === 0 && retrievalResult.books.filter(book => (book.similarityScore || 0) > 0.42).length === 0}
                                    >
                                        生成解读 {selectedCount > 0 && `(${selectedCount}本)`}
                                    </button>
                                    <button
                                        onClick={() => handleGenerateInterpretation()}
                                        className="px-4 py-2 border border-[#343434] text-[#E8E6DC] rounded-lg text-sm hover:bg-[#1B1B1B] transition-colors"
                                    >
                                        自动筛选
                                    </button>
                                    <button
                                        onClick={onCancelSelection}
                                        className="px-4 py-2 border border-[#343434] text-[#A2A09A] rounded-lg text-sm hover:bg-[#1B1B1B] transition-colors"
                                    >
                                        取消选择
                                    </button>
                                </div>
                            )}
                            
                            {/* 显示更多按钮 - 只在非选择模式且有超过3本书时显示 */}
                            {!isSelectionMode && retrievalResult.books.length > 3 && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowAll(!showAll);
                                    }}
                                    className="w-full py-2 mt-3 text-center text-[#C9A063] text-sm hover:bg-[#1B1B1B] rounded-lg transition-colors border border-[#343434]"
                                >
                                    {showAll ? '▲ 收起' : `▼ 显示全部 ${retrievalResult.books.length} 本`}
                                </button>
                            )}
                            
                            {/* 重新选择按钮 - 在非选择模式下显示 */}
                            {!isSelectionMode && onReenterSelection && retrievalResult.books.length > 0 && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onReenterSelection();
                                    }}
                                    className="w-full py-2 mt-2 text-center text-[#E8E6DC] text-sm hover:bg-[#C9A063] hover:text-black rounded-lg transition-colors border border-[#343434]"
                                >
                                    🔄 重新选择图书进行解读
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}