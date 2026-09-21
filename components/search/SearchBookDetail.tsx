'use client';

import { motion } from 'framer-motion';
import type { SearchResultItem } from '@/lib/search/types';
import BookDetailPanel from '@/components/BookDetailPanel';

interface SearchBookDetailProps {
    results: SearchResultItem[];
    /** 当前展开的结果下标，null 表示未展开 */
    activeIndex: number | null;
    onClose: () => void;
    onSelectIndex: (index: number) => void;
    onOpenArchive: (deepLink: string) => void;
}

/**
 * 检索结果详情：复用画板同款右侧详情面板 + 左侧大封面。
 * 上一条/下一条在检索结果间循环切换，关闭即回到结果列表。
 */
export default function SearchBookDetail({
    results,
    activeIndex,
    onClose,
    onSelectIndex,
    onOpenArchive
}: SearchBookDetailProps) {
    if (activeIndex === null || activeIndex < 0 || activeIndex >= results.length) {
        return null;
    }

    const item = results[activeIndex];
    const book = item.book;
    const coverSrc = book.coverThumbnailUrl || book.coverImageUrl || book.coverUrl;

    const goTo = (delta: number) => {
        onSelectIndex((activeIndex + delta + results.length) % results.length);
    };

    return (
        <>
            {/* 点击空白处关闭，回到检索结果 */}
            <div
                className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* 左侧大封面：与画板聚焦态一致，封面本身不关闭，仅点空白处关闭 */}
            <motion.div
                key={book.id}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="fixed left-[10%] top-[10%] z-[115] hidden h-[80%] w-[30%] lg:block"
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={coverSrc}
                    alt={book.title}
                    className="h-full w-full object-contain drop-shadow-2xl"
                />
            </motion.div>

            <BookDetailPanel
                book={book}
                onClose={onClose}
                onPrev={() => goTo(-1)}
                onNext={() => goTo(1)}
                meta={
                    <div className="flex flex-wrap items-center gap-4 border border-[#C9A063]/30 bg-[#C9A063]/10 px-4 py-3">
                        <div>
                            <span className="block font-mono text-[11px] text-[#A2A09A]">Jev 语义相关度</span>
                            <span className="font-mono text-2xl font-bold tabular-nums text-[#C9A063]">
                                {item.relevancePct}%
                            </span>
                        </div>
                        {item.lanes.length > 0 && (
                            <span className="font-mono text-[10px] text-[#8C8982]">
                                通道: {item.lanes.join(' + ')}
                            </span>
                        )}
                    </div>
                }
                actions={
                    <button
                        type="button"
                        onClick={() => onOpenArchive(item.deepLink)}
                        className="inline-flex items-center gap-2 bg-[#C9A063] px-5 py-2.5 font-display text-sm font-medium text-[#161514] transition-all hover:bg-[#D4A574]"
                    >
                        <span>前往期刊档案完整阅览</span>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                    </button>
                }
            />
        </>
    );
}
