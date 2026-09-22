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
                    <div
                        className="inline-flex items-center gap-2 rounded border border-[#C9A063]/30 bg-[#C9A063]/10 px-2.5 py-1 text-xs"
                        title={item.lanes.length > 0 ? `通道: ${item.lanes.join(' + ')}` : undefined}
                    >
                        <span className="font-mono text-[11px] text-[#A2A09A]">Jev 相关度</span>
                        <span className="font-mono font-bold tabular-nums text-[#C9A063]">
                            {item.relevancePct}%
                        </span>
                        {item.lanes.length > 0 && (
                            <span className="hidden font-mono text-[10px] text-[#8C8982] sm:inline">
                                ({item.lanes.join('+')})
                            </span>
                        )}
                    </div>
                }
                actions={
                    <button
                        type="button"
                        onClick={() => onOpenArchive(item.deepLink)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#C9A063]/40 bg-[#C9A063]/20 text-[#F0D5A3] font-medium text-xs hover:bg-[#C9A063]/30 hover:border-[#C9A063]/60 hover:text-white transition-colors cursor-pointer"
                    >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5V4.5a.75.75 0 01.75-.75h3m9 0h3a.75.75 0 01.75.75v3m0 9v3a.75.75 0 01-.75.75h-3m-9 0h-3a.75.75 0 01-.75-.75v-3" />
                            <circle cx="12" cy="12" r="2.25" />
                        </svg>
                        <span>前往画布</span>
                    </button>
                }
            />
        </>
    );
}
