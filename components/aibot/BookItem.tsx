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
            className={`book-item ${isExpanded ? 'expanded' : ''} ${localSelected ? 'selected' : ''} mb-3 flex gap-3 rounded-[1.35rem] border px-3 py-3 transition-all duration-200 ${localSelected ? 'border-[#C9A063]/34 bg-[#C9A063]/8 shadow-[0_12px_28px_rgba(201,160,99,0.08)]' : 'border-[#E8E6DC]/8 bg-[#151412] hover:border-[#C9A063]/20 hover:bg-[#1A1815]'} ${showCheckbox || !isCompact ? 'cursor-pointer' : 'cursor-default'}`}
            whileHover={{ scale: 1.005 }}
            onClick={handleClick}
        >
            {/* 复选框 */}
            {showCheckbox && (
                <div className="book-checkbox flex items-center justify-center pt-1">
                    <input
                        type="checkbox"
                        checked={localSelected}
                        onChange={(e) => handleSelectionChange(e.target.checked)}
                        className="h-4 w-4 rounded border-[#4A4338] bg-[#11100E] focus:ring-2 focus:ring-[#C9A063]"
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
            
            <div className="flex-1 min-w-0 font-info-content">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold text-[#F4ECDD] md:text-[15px]">
                            {book.title}
                        </h3>
                        {book.subtitle && !isCompact && (
                            <p className="mt-1 truncate text-xs text-[#A9A293]">
                                {book.subtitle}
                            </p>
                        )}
                        <p className="mt-2 text-sm text-[#CEC6B7]">
                            {book.author}
                        </p>
                    </div>
                    {localSelected && (
                        <span className="aibot-chip aibot-chip--active">已选择</span>
                    )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                    {book.rating && (
                        <span className="aibot-chip">
                            <span className="text-[#C9A063]">★</span>
                            {book.rating}
                        </span>
                    )}
                    {book.similarityScore !== undefined && book.similarityScore !== null && (
                        <span className="aibot-chip">相似 {book.similarityScore.toFixed(3)}</span>
                    )}
                    {book.fusedScore !== undefined && book.fusedScore !== null && (
                        <span className="aibot-chip">融合 {book.fusedScore.toFixed(3)}</span>
                    )}
                    {book.finalScore !== undefined && book.finalScore !== null && (
                        <span className="aibot-chip">最终 {book.finalScore.toFixed(3)}</span>
                    )}
                    {book.callNumber && (
                        <span className="aibot-chip text-[#E2D0AE]">索书号 {book.callNumber}</span>
                    )}
                    {book.publishYear && (
                        <span className="aibot-chip">{book.publishYear}年</span>
                    )}
                </div>

                {/* 亮点信息 */}
                {book.highlights && book.highlights.length > 0 && (
                    <div className="mt-3 rounded-2xl border border-[#E8E6DC]/8 bg-[#11100E]/70 px-3 py-2.5">
                        <p className="text-xs leading-6 text-[#B9B1A2] font-info-content line-clamp-2">
                            {book.highlights.join('； ')}
                        </p>
                    </div>
                )}

                {/* 摘要信息 - 可折叠显示 */}
                {book.description && (
                    <div className="mt-3">
                        <div className="mb-1 flex items-center gap-2">
                            <span className="text-xs text-[#7E776C]">摘要</span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowAbstract(!showAbstract);
                                }}
                                className="text-xs text-[#C9A063] hover:text-[#E8E6DC] transition-colors"
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
                                    <p className="rounded-2xl border border-[#E8E6DC]/8 bg-[#11100E]/80 p-3 text-xs leading-6 text-[#C0B8AA] font-info-content">
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