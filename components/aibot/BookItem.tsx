'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import type { BookInfo } from '@/src/core/aibot/types';

export interface BookItemProps {
    book: BookInfo;
    isCompact?: boolean;
    isSelected?: boolean;
    onSelectionChange?: (bookId: string, isSelected: boolean) => void;
    showCheckbox?: boolean;
    disabled?: boolean;
}

export default function BookItem({
    book,
    isCompact = false,
    isSelected = false,
    onSelectionChange,
    showCheckbox = false,
    disabled = false
}: BookItemProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [localSelected, setLocalSelected] = useState(isSelected);

    // 同步父组件传入的选中状态
    useEffect(() => {
        setLocalSelected(isSelected);
    }, [isSelected]);

    // 处理选择变化
    const handleSelectionChange = (checked: boolean) => {
        if (disabled) return;
        setLocalSelected(checked);
        onSelectionChange?.(book.id, checked);
    };

    // 处理卡片整体点击
    const handleCardClick = (e: React.MouseEvent) => {
        // 如果点击的是带有 .book-item-action 类名的按钮（如展开简介按钮），不触发表单勾选
        if ((e.target as HTMLElement).closest('.book-item-action')) {
            return;
        }

        // 当显示复选框且未被禁用时，点击卡片任意非按钮区域均可切换勾选状态
        if (showCheckbox && !disabled) {
            handleSelectionChange(!localSelected);
        }
    };

    // 是否有可展开的详细信息
    const hasDetails = Boolean(
        book.description ||
        book.authorIntro ||
        book.publisher ||
        book.publishYear ||
        book.isbn ||
        book.pageCount ||
        (book.tags && book.tags.length > 0)
    );

    return (
        <div
            onClick={handleCardClick}
            className={clsx(
                'book-item group relative flex flex-col rounded-lg border transition-all duration-200 select-none mb-2.5',
                showCheckbox && !disabled ? 'cursor-pointer' : 'cursor-default',
                localSelected
                    ? 'border-[#C9A063] bg-[#C9A063]/10 shadow-[0_0_16px_rgba(201,160,99,0.18)]'
                    : 'border-[#C9A063]/25 bg-[#171615]/85 hover:border-[#C9A063]/50 hover:bg-[#1d1b19]/90 shadow-[0_4px_16px_rgba(0,0,0,0.35)]',
                disabled && 'opacity-60 cursor-not-allowed'
            )}
        >
            {/* 上半部分：图书卡片摘要行 */}
            <div className="flex items-start gap-3 p-3.5">
                {/* 勾选复选框 */}
                {showCheckbox && (
                    <div
                        className="pt-0.5 flex-shrink-0 flex items-center justify-center cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleSelectionChange(!localSelected);
                        }}
                        title={localSelected ? '取消选择' : '勾选此书'}
                        aria-label={localSelected ? `取消勾选《${book.title}》` : `勾选《${book.title}》`}
                    >
                        <div
                            className={clsx(
                                'w-5 h-5 rounded border flex items-center justify-center transition-all duration-150',
                                localSelected
                                    ? 'bg-[#C9A063] border-[#C9A063] text-[#121110] shadow-[0_0_8px_rgba(201,160,99,0.4)]'
                                    : 'bg-[#141312]/80 border-[#C9A063]/40 text-transparent hover:border-[#C9A063]/80'
                            )}
                        >
                            <svg
                                className={clsx(
                                    'w-3.5 h-3.5 transition-transform duration-150',
                                    localSelected ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
                                )}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                    </div>
                )}

                {/* 图书封面 */}
                {book.coverUrl && (
                    <div className="relative flex-shrink-0 w-12 h-16 rounded overflow-hidden shadow-md outline outline-1 outline-white/10 bg-[#141312]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={book.coverUrl}
                            alt={book.title}
                            loading="lazy"
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            onError={(e) => {
                                (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
                            }}
                        />
                    </div>
                )}

                {/* 图书核心元信息 */}
                <div className="flex-1 min-w-0 font-info-content">
                    {/* 标题栏与简介展开按钮 */}
                    <div className="flex items-start justify-between gap-2">
                        <h3 className="font-display font-medium text-sm text-[#F2F0E9] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] truncate">
                            {book.title}
                            {book.subtitle && !isCompact && (
                                <span className="ml-1.5 font-normal text-xs text-[#A2A09A]">
                                    {book.subtitle}
                                </span>
                            )}
                        </h3>

                        {/* 独立展开/收起简介按钮 */}
                        {hasDetails && !isCompact && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsExpanded(!isExpanded);
                                }}
                                className="book-item-action flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded border border-[#C9A063]/30 bg-[#141312]/70 hover:border-[#C9A063]/70 hover:bg-[#C9A063]/15 text-[#C9A063] text-[11px] font-mono tracking-wider transition-all duration-150 active:scale-[0.96]"
                                title={isExpanded ? '收起简介与详情' : '展开图书完整简介与出版信息'}
                            >
                                <span>{isExpanded ? '收起' : '简介'}</span>
                                <motion.span
                                    animate={{ rotate: isExpanded ? 180 : 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="text-[9px] inline-block"
                                >
                                    ▼
                                </motion.span>
                            </button>
                        )}
                    </div>

                    {/* 作者与出版信息 */}
                    <p className="text-xs text-[#C5C2BA] mt-0.5 truncate">
                        {book.author}
                        {book.publisher && <span className="text-[#7C7A74]"> · {book.publisher}</span>}
                        {book.publishYear && (
                            <span className="text-[#7C7A74] tabular-nums"> · {book.publishYear}年</span>
                        )}
                    </p>

                    {/* 指标与评分徽标 */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {book.rating !== undefined && book.rating !== null && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-[#C9A063]/15 border border-[#C9A063]/30 text-[#C9A063] font-mono text-xs tabular-nums">
                                <span>★</span>
                                <span>{book.rating}</span>
                            </span>
                        )}
                        {book.similarityScore !== undefined && book.similarityScore !== null && (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#A2A09A] tabular-nums">
                                <span className="text-[#6F6D68]">相关度:</span>
                                <span className="text-[#E8E6DC]">{book.similarityScore.toFixed(3)}</span>
                            </span>
                        )}
                        {book.fusedScore !== undefined && book.fusedScore !== null && (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#A2A09A] tabular-nums">
                                <span className="text-[#6F6D68]">融合:</span>
                                <span className="text-[#E8E6DC]">{book.fusedScore.toFixed(3)}</span>
                            </span>
                        )}
                        {book.callNumber && (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#C9A063]/90 tabular-nums">
                                <span className="text-[#6F6D68]">索书号:</span>
                                <span>{book.callNumber}</span>
                            </span>
                        )}
                    </div>

                    {/* 折叠状态下的亮点或摘要预览（2行截断） */}
                    {!isExpanded && (book.highlights?.length || book.description) && (
                        <p className="mt-1.5 text-xs text-[#A2A09A] font-info-content line-clamp-2 leading-relaxed">
                            {book.highlights?.length ? book.highlights.join('；') : book.description}
                        </p>
                    )}
                </div>
            </div>

            {/* 下半部分：垂直流展开的详细信息抽屉（绝不挤压横向布局） */}
            <AnimatePresence>
                {isExpanded && hasDetails && !isCompact && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                        className="overflow-hidden border-t border-[#C9A063]/20 bg-[#121110]/95 rounded-b-lg"
                    >
                        <div className="p-4 space-y-3 font-info-content">
                            {/* 内容简介 */}
                            {book.description && (
                                <div>
                                    <h4 className="text-[#C9A063] font-mono font-medium text-xs tracking-wider mb-1.5 flex items-center gap-1.5">
                                        <span>📖</span>
                                        <span>内容简介</span>
                                    </h4>
                                    <div className="max-h-56 overflow-y-auto about-overlay-scroll pr-2 text-xs md:text-sm text-[#DCD9D0] leading-relaxed whitespace-pre-wrap select-text bg-[#181716]/60 p-3 rounded border border-white/5">
                                        {book.description}
                                    </div>
                                </div>
                            )}

                            {/* 作者简介 */}
                            {book.authorIntro && (
                                <div>
                                    <h4 className="text-[#C9A063] font-mono font-medium text-xs tracking-wider mb-1.5 flex items-center gap-1.5">
                                        <span>✍️</span>
                                        <span>作者简介</span>
                                    </h4>
                                    <div className="max-h-36 overflow-y-auto about-overlay-scroll pr-2 text-xs text-[#A2A09A] leading-relaxed whitespace-pre-wrap select-text bg-[#181716]/60 p-2.5 rounded border border-white/5">
                                        {book.authorIntro}
                                    </div>
                                </div>
                            )}

                            {/* 出版与馆藏信息 */}
                            <div className="pt-2 border-t border-white/5 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
                                {book.publisher && (
                                    <div>
                                        <span className="text-[#6F6D68]">出版社: </span>
                                        <span className="text-[#E8E6DC]">{book.publisher}</span>
                                    </div>
                                )}
                                {book.publishYear && (
                                    <div>
                                        <span className="text-[#6F6D68]">出版年: </span>
                                        <span className="text-[#E8E6DC] tabular-nums">{book.publishYear}</span>
                                    </div>
                                )}
                                {book.pageCount && (
                                    <div>
                                        <span className="text-[#6F6D68]">页数: </span>
                                        <span className="text-[#E8E6DC] tabular-nums">{book.pageCount}页</span>
                                    </div>
                                )}
                                {book.isbn && (
                                    <div>
                                        <span className="text-[#6F6D68]">ISBN: </span>
                                        <span className="text-[#E8E6DC] tabular-nums">{book.isbn}</span>
                                    </div>
                                )}
                                {book.callNumber && (
                                    <div>
                                        <span className="text-[#6F6D68]">索书号: </span>
                                        <span className="text-[#C9A063]">{book.callNumber}</span>
                                    </div>
                                )}
                                {book.tags && book.tags.length > 0 && (
                                    <div className="col-span-full flex items-center gap-1.5 flex-wrap mt-1">
                                        <span className="text-[#6F6D68]">标签: </span>
                                        {book.tags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="px-1.5 py-0.5 rounded bg-[#C9A063]/10 border border-[#C9A063]/25 text-[#C9A063] text-[10px]"
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
