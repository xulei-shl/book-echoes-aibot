'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { BookInfo } from '@/src/core/aibot/types';

export default function BookItem({ 
    book, 
    isCompact = false,
    isSelected = false,
    onSelectionChange,
    showCheckbox = false
}: { 
    book: BookInfo; 
    isCompact?: boolean;
    isSelected?: boolean;
    onSelectionChange?: (bookId: string, isSelected: boolean) => void;
    showCheckbox?: boolean;
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [localSelected, setLocalSelected] = useState(isSelected);
    const [showAbstract, setShowAbstract] = useState(false);

    // 同步父组件传入的选中状态
    useEffect(() => {
        setLocalSelected(isSelected);
    }, [isSelected]);

    // 处理选择变化
    const handleSelectionChange = (checked: boolean) => {
        setLocalSelected(checked);
        onSelectionChange?.(book.id, checked);
    };

    // 处理点击事件
    const handleClick = (e: React.MouseEvent) => {
        // 如果显示复选框，点击复选框区域才触发选择
        if (showCheckbox && (e.target as HTMLElement).closest('.book-checkbox')) {
            return;
        }
        
        // 原有的展开逻辑
        if (!isCompact && !showCheckbox) {
            setIsExpanded(!isExpanded);
        }
    };

    return (
        <motion.div
            className={`book-item ${isExpanded ? 'expanded' : ''} ${localSelected ? 'selected' : ''} flex gap-3 p-3 rounded-lg bg-[rgba(27,27,27,0.6)] mb-2 cursor-pointer transition-all duration-200 hover:bg-[rgba(201,160,99,0.15)] hover:translate-x-1 ${localSelected ? 'border border-[#C9A063] bg-[rgba(201,160,99,0.1)]' : ''}`}
            whileHover={{ scale: 1.01 }}
            onClick={handleClick}
        >
            {/* 复选框 */}
            {showCheckbox && (
                <div className="book-checkbox flex items-center justify-center">
                    <input
                        type="checkbox"
                        checked={localSelected}
                        onChange={(e) => handleSelectionChange(e.target.checked)}
                        className="w-4 h-4 text-[#C9A063] bg-[#1B1B1B] border-[#343434] rounded focus:ring-[#C9A063] focus:ring-2"
                        style={{ accentColor: '#C9A063' }}
                    />
                </div>
            )}
            
            {/* 图书封面 */}
            {book.coverUrl && (
                <img 
                    src={book.coverUrl} 
                    alt={book.title}
                    className="w-12 h-16 object-cover rounded flex-shrink-0"
                    onError={(e) => {
                        // 图片加载失败时隐藏
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
            )}
            
            {/* 基本信息 */}
            <div className="flex-1 min-w-0 font-info-content">
                <h3 className="text-[#E8E6DC] font-medium text-sm truncate mb-1">
                    {book.title}
                </h3>
                {book.subtitle && !isCompact && (
                    <p className="text-[#A2A09A] text-xs truncate mb-1">
                        {book.subtitle}
                    </p>
                )}
                <p className="text-[#A2A09A] text-sm mb-1">
                    {book.author}
                </p>
                
                <div className="flex items-center gap-3 flex-wrap">
                    {book.rating && (
                        <div className="flex items-center gap-1">
                            <span className="text-[#C9A063] text-xs">★</span>
                            <span className="text-[#E8E6DC] text-xs">{book.rating}</span>
                        </div>
                    )}
                    {book.similarityScore !== undefined && book.similarityScore !== null && (
                        <div className="flex items-center gap-1">
                            <span className="text-[#6F6D68] text-xs">相似:</span>
                            <span className="text-[#A2A09A] text-xs font-medium">{book.similarityScore.toFixed(3)}</span>
                        </div>
                    )}
                    {book.fusedScore !== undefined && book.fusedScore !== null && (
                        <div className="flex items-center gap-1">
                            <span className="text-[#6F6D68] text-xs">融合:</span>
                            <span className="text-[#A2A09A] text-xs font-medium">{book.fusedScore.toFixed(3)}</span>
                        </div>
                    )}
                    {book.finalScore !== undefined && book.finalScore !== null && (
                        <div className="flex items-center gap-1">
                            <span className="text-[#6F6D68] text-xs">最终:</span>
                            <span className="text-[#A2A09A] text-xs font-medium">{book.finalScore.toFixed(3)}</span>
                        </div>
                    )}
                    {book.callNumber && (
                        <div className="flex items-center gap-1">
                            <span className="text-[#6F6D68] text-xs">索书号:</span>
                            <span className="text-[#C9A063] text-xs font-medium">{book.callNumber}</span>
                        </div>
                    )}
                    {book.publishYear && (
                        <span className="text-[#6F6D68] text-xs">{book.publishYear}年</span>
                    )}
                </div>

                {/* 亮点信息 */}
                {book.highlights && book.highlights.length > 0 && (
                    <div className="mt-2">
                        <p className="text-[#A2A09A] text-xs line-clamp-2 font-info-content">
                            {book.highlights.join('; ')}
                        </p>
                    </div>
                )}

                {/* 摘要信息 - 可折叠显示 */}
                {book.description && (
                    <div className="mt-2">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[#6F6D68] text-xs">摘要:</span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowAbstract(!showAbstract);
                                }}
                                className="text-[#C9A063] text-xs hover:text-[#E8E6DC] transition-colors"
                            >
                                {showAbstract ? '收起' : '展开'}
                            </button>
                        </div>
                        <AnimatePresence>
                            {showAbstract && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="overflow-hidden"
                                >
                                    <p className="text-[#A2A09A] text-xs leading-relaxed bg-[#1B1B1B] p-2 rounded border border-[#343434] font-info-content">
                                        {book.description}
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* 展开的详细信息 */}
            <AnimatePresence>
                {isExpanded && !isCompact && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="col-span-full mt-4 p-4 bg-[#1B1B1B] rounded-lg border border-[#343434]"
                    >
                        {book.description && (
                            <div className="mb-3">
                                <h4 className="text-[#C9A063] font-medium mb-2 text-sm">内容简介</h4>
                                <p className="text-[#A2A09A] text-sm leading-relaxed font-info-content">{book.description}</p>
                            </div>
                        )}
                        
                        {book.authorIntro && (
                            <div className="mb-3">
                                <h4 className="text-[#C9A063] font-medium mb-2 text-sm">作者简介</h4>
                                <p className="text-[#A2A09A] text-sm leading-relaxed font-info-content">{book.authorIntro}</p>
                            </div>
                        )}
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            {book.publisher && (
                                <div>
                                    <span className="text-[#6F6D68]">出版社：</span>
                                    <span className="text-[#E8E6DC] font-info-content">{book.publisher}</span>
                                </div>
                            )}
                            {book.pageCount && (
                                <div>
                                    <span className="text-[#6F6D68]">页数：</span>
                                    <span className="text-[#E8E6DC] font-info-content">{book.pageCount}</span>
                                </div>
                            )}
                            {book.isbn && (
                                <div>
                                    <span className="text-[#6F6D68]">ISBN：</span>
                                    <span className="text-[#E8E6DC] font-info-content">{book.isbn}</span>
                                </div>
                            )}
                            {book.tags && book.tags.length > 0 && (
                                <div className="col-span-2">
                                    <span className="text-[#6F6D68]">标签：</span>
                                    <span className="text-[#E8E6DC] font-info-content">{book.tags.join(', ')}</span>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}