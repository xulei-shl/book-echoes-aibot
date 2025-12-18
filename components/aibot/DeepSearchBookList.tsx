'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BookItem from './BookItem';
import type { BookInfo } from '@/src/core/aibot/types';

interface DeepSearchBookListProps {
    books: BookInfo[];
    draftMarkdown: string;
    onBookSelection: (selectedBooks: BookInfo[]) => void;
    onGenerateInterpretation: (selectedBooks: BookInfo[], draftMarkdown: string) => void;
    isLoading?: boolean;
}

export default function DeepSearchBookList({
    books,
    draftMarkdown,
    onBookSelection,
    onGenerateInterpretation,
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

    return (
        <div className="mb-4">
            {/* 图书列表头部 */}
            <motion.div
                className="flex items-center justify-between p-3 rounded-t-xl border border-[#343434] bg-[rgba(201,160,99,0.1)] cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
                whileHover={{ backgroundColor: 'rgba(201, 160, 99, 0.2)' }}
                transition={{ duration: 0.2 }}
            >
                <div className="flex items-center gap-3">
                    <span className="text-[#C9A063] text-sm font-medium">
                        📚 深度检索结果
                    </span>
                    <span className="text-[#E8E6DC] text-sm">
                        找到 {books.length} 本相关图书
                    </span>
                    {selectedBooks.length > 0 && (
                        <span className="text-[#C9A063] text-xs">
                            已选择 {selectedBooks.length} 本
                        </span>
                    )}
                    {isLoading && (
                        <span className="animate-pulse text-xs text-[#A2A09A]">加载中...</span>
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
                        <div className="border border-[#343434] border-t-0 rounded-b-xl bg-[rgba(26,26,26,0.8)]">
                            {/* 图书列表 */}
                            <div className="p-4 max-h-96 overflow-y-auto">
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
                                        <p className="text-[#A2A09A] text-sm mb-2">未找到相关图书</p>
                                        <p className="text-[#6F6D68] text-xs">请尝试调整搜索关键词或搜索条件</p>
                                        {/* 添加调试信息 */}
                                        <div className="mt-4 p-2 bg-[#1B1B1B] rounded text-xs text-left">
                                            <p className="text-[#6F6D68]">调试信息:</p>
                                            <p className="text-[#6F6D68]">总图书数: {books.length}</p>
                                            <p className="text-[#6F6D68]">显示图书数: {displayBooks.length}</p>
                                            <p className="text-[#6F6D68]">显示全部: {showAll ? '是' : '否'}</p>
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
                                        className="w-full py-2 mt-3 text-center text-[#C9A063] text-sm hover:bg-[#1B1B1B] rounded-lg transition-colors border border-[#343434]"
                                    >
                                        {showAll ? '▲ 收起' : `▼ 显示全部 ${books.length} 本`}
                                    </button>
                                )}
                            </div>

                            {/* 操作按钮 */}
                            <div className="p-4 border-t border-[#343434]">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="text-sm text-[#A2A09A]">
                                        选择图书后可生成深度解读
                                    </div>
                                    <div className="text-sm text-[#E8E6DC]">
                                        {selectedBooks.length > 0 && `已选择 ${selectedBooks.length} 本`}
                                    </div>
                                </div>
                                
                                <div className="flex flex-wrap gap-3">
                                    <button
                                        onClick={handleGenerateInterpretation}
                                        disabled={selectedBooks.length === 0 || isLoading}
                                        className="px-4 py-2 bg-[#C9A063] text-black rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#D4A863] transition-colors"
                                    >
                                        生成深度解读 {selectedBooks.length > 0 && `(${selectedBooks.length}本)`}
                                    </button>
                                    
                                    <button
                                        onClick={handleAutoSelect}
                                        disabled={isLoading}
                                        className="px-4 py-2 border border-[#343434] text-[#E8E6DC] rounded-lg text-sm hover:bg-[#1B1B1B] transition-colors disabled:opacity-50"
                                    >
                                        自动筛选
                                    </button>
                                    
                                    <button
                                        onClick={() => {
                                            setSelectedBookIds(new Set());
                                            onBookSelection([]);
                                        }}
                                        className="px-4 py-2 border border-[#343434] text-[#A2A09A] rounded-lg text-sm hover:bg-[#1B1B1B] transition-colors"
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