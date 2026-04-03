'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BookItem from './BookItem';
import type { BookInfo } from '@/src/core/aibot/types';

interface DeepSearchBookListProps {
    books: BookInfo[];
    draftMarkdown: string;
    userInput: string; // 新增：用户原始输入
    onBookSelection: (selectedBooks: BookInfo[]) => void;
    onGenerateInterpretation: (selectedBooks: BookInfo[], draftMarkdown: string) => void;
    onSecondaryRetrieval?: (selectedBooks: BookInfo[], query: string) => void; // 新增：二次检索回调
    isLoading?: boolean;
}

export default function DeepSearchBookList({
    books,
    draftMarkdown,
    userInput,
    onBookSelection,
    onGenerateInterpretation,
    onSecondaryRetrieval,
    isLoading = false
}: DeepSearchBookListProps) {
    const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());
    const [isExpanded, setIsExpanded] = useState(true);
    const [showAll, setShowAll] = useState(false);

    const selectedBooks = books.filter(book => selectedBookIds.has(book.id));
    const displayBooks = showAll ? books : books.slice(0, 5);

    const handleSelectionChange = (bookId: string, isSelected: boolean) => {
        const newSelectedIds = new Set(selectedBookIds);
        if (isSelected) {
            newSelectedIds.add(bookId);
        } else {
            newSelectedIds.delete(bookId);
        }
        setSelectedBookIds(newSelectedIds);
        
        const newSelectedBooks = books.filter(book => newSelectedIds.has(book.id));
        onBookSelection(newSelectedBooks);
    };

    const handleGenerateInterpretation = () => {
        if (selectedBooks.length > 0) {
            onGenerateInterpretation(selectedBooks, draftMarkdown);
        }
    };

    const handleAutoSelect = () => {
        // 自动筛选相似度>0.4的图书
        const autoSelectedBooks = books.filter(book =>
            (book.similarityScore || book.finalScore || 0) > 0.4
        );
        const autoSelectedIds = new Set(autoSelectedBooks.map(book => book.id));
        setSelectedBookIds(autoSelectedIds);
        onBookSelection(autoSelectedBooks);
    };

    // 新增：处理二次检索
    const handleSecondaryRetrieval = () => {
        if (selectedBooks.length > 0 && onSecondaryRetrieval) {
            onSecondaryRetrieval(selectedBooks, userInput);
        }
    };

    return (
        <div className="mb-4">
            {/* 图书列表头部 */}
            <motion.div
                className="flex items-center justify-between p-3 border border-[#C9A063]/30 bg-[#1a1a1a]/80 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
                whileHover={{ backgroundColor: 'rgba(201, 160, 99, 0.15)' }}
                transition={{ duration: 0.2 }}
            >
                <div className="flex items-center gap-3">
                    <span className="text-[#C9A063] text-sm font-mono tracking-wider">
                        📚 深度检索结果
                    </span>
                    <span className="text-[#E8E6DC] text-sm font-info-content">
                        找到 {books.length} 本相关图书
                    </span>
                    {selectedBooks.length > 0 && (
                        <span className="text-[#C9A063] text-xs font-mono">
                            已选择 {selectedBooks.length} 本
                        </span>
                    )}
                    {isLoading && (
                        <span className="animate-pulse text-xs text-[#A2A09A] font-info-content">加载中...</span>
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

            {/* 图书列表内容 */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                    >
                        <div className="border border-[#C9A063]/30 border-t-0 bg-[#1a1a1a]/90 backdrop-blur-xl">
                            {/* 图书列表 */}
                            <div className="p-4 max-h-96 overflow-y-auto about-overlay-scroll">
                                {displayBooks.length > 0 ? (
                                    displayBooks.map((book, index) => (
                                        <BookItem
                                            key={`${book.id}-${index}`}
                                            book={book}
                                            isCompact={true}
                                            showCheckbox={true}
                                            isSelected={selectedBookIds.has(book.id)}
                                            onSelectionChange={handleSelectionChange}
                                        />
                                    ))
                                ) : (
                                    <div className="text-center py-8">
                                        <p className="text-[#A2A09A] text-sm mb-2 font-info-content">未找到相关图书</p>
                                        <p className="text-[#6F6D68] text-xs font-info-content">请尝试调整搜索关键词或搜索条件</p>
                                        <div className="mt-4 p-2 bg-[#1a1a1a]/80 border border-[#C9A063]/20 rounded text-xs text-left">
                                            <p className="text-[#6F6D68] font-info-content">调试信息:</p>
                                            <p className="text-[#6F6D68] font-info-content">总图书数: {books.length}</p>
                                            <p className="text-[#6F6D68] font-info-content">显示图书数: {displayBooks.length}</p>
                                            <p className="text-[#6F6D68] font-info-content">显示全部: {showAll ? '是' : '否'}</p>
                                        </div>
                                    </div>
                                )}
                                
                                {/* 显示更多按钮 */}
                                {books.length > 5 && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowAll(!showAll);
                                        }}
                                        className="w-full py-2 mt-3 text-center text-[#C9A063] text-sm font-mono tracking-wider hover:bg-[#C9A063]/10 transition-colors border border-[#C9A063]/30"
                                    >
                                        {showAll ? '▲ 收起' : `▼ 显示全部 ${books.length} 本`}
                                    </button>
                                )}
                            </div>

                            {/* 操作按钮 */}
                            <div className="p-4 border-t border-[#C9A063]/30">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="text-sm text-[#A2A09A] font-info-content">
                                        选择图书后可生成深度解读
                                    </div>
                                    <div className="text-sm text-[#E8E6DC] font-mono tracking-wider">
                                        {selectedBooks.length > 0 && `已选择 ${selectedBooks.length} 本`}
                                    </div>
                                </div>
                                
                                <div className="flex flex-wrap gap-3">
                                    <div className="relative group">
                                        <button
                                            onClick={handleGenerateInterpretation}
                                            disabled={selectedBooks.length === 0 || isLoading}
                                            className="px-4 py-2 bg-[#C9A063] text-[#1a1a1a] border border-[#C9A063] text-sm font-mono tracking-wider disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#C9A063]/20 hover:text-[#C9A063] transition-colors"
                                        >
                                            深度解读 {selectedBooks.length > 0 && `(${selectedBooks.length}本)`}
                                        </button>
                                        <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-[#1a1a1a] text-[#E8E6DC] text-xs font-info-content opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 border border-[#C9A063]/20 max-w-xs min-w-48">
                                            基于选中的图书生成深度AI解读内容
                                        </div>
                                    </div>

                                    {/* 新增：二次检索按钮 */}
                                    <div className="relative group">
                                        <button
                                            onClick={handleSecondaryRetrieval}
                                            disabled={selectedBooks.length === 0 || !onSecondaryRetrieval || isLoading}
                                            className="px-4 py-2 border border-[#C9A063]/30 text-[#E8E6DC] text-sm font-mono tracking-wider hover:bg-[#C9A063]/10 hover:text-[#C9A063] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            二次检索 {selectedBooks.length > 0 && `(${selectedBooks.length}本)`}
                                        </button>
                                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-[#1a1a1a] text-[#E8E6DC] text-xs font-info-content opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 border border-[#C9A063]/20 max-w-xs min-w-48">
                                            基于选中图书进行二次检索，切换到简单检索模式
                                        </div>
                                    </div>

                                    <div className="relative group">
                                        <button
                                            onClick={handleAutoSelect}
                                            disabled={isLoading}
                                            className="px-4 py-2 border border-[#C9A063]/30 text-[#C9A063]/70 text-sm font-mono tracking-wider hover:bg-[#C9A063]/10 transition-colors disabled:opacity-50"
                                        >
                                            自动筛选
                                        </button>
                                        <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-[#1a1a1a] text-[#E8E6DC] text-xs font-info-content opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 border border-[#C9A063]/20 max-w-xs min-w-48">
                                            自动选择相似度{'>'}0.4的高相关度图书
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => {
                                            setSelectedBookIds(new Set());
                                            onBookSelection([]);
                                        }}
                                        className="px-4 py-2 border border-[#C9A063]/30 text-[#A2A09A] text-sm font-mono tracking-wider hover:bg-[#C9A063]/10 hover:text-[#C9A063] transition-colors"
                                    >
                                        清空选择
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}