'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Book } from '@/types';
import BookCard from './BookCard';
import { useStore } from '@/store/useStore';
import { useMemo, useRef } from 'react';

interface DockProps {
    books: Book[];
}

// Dock 卡片动态配置类型
export interface DockCardConfig {
    minWidth: number;
    tracking: string;
    fontSize: string;
    maxWidth?: string;
}

export default function Dock({ books }: DockProps) {
    const { focusedBookId } = useStore();
    const showDock = !focusedBookId;
    const scrollRef = useRef<HTMLDivElement>(null);

    // 根据书籍数量动态计算配置参数
    const dockConfig = useMemo<DockCardConfig>(() => {
        const bookCount = books.length;

        if (bookCount > 20) {
            return {
                minWidth: 14,
                tracking: '0.08em',
                fontSize: 'text-xs sm:text-sm'
            };
        } else if (bookCount > 15) {
            return {
                minWidth: 15,
                tracking: '0.1em',
                fontSize: 'text-xs sm:text-sm'
            };
        } else if (bookCount > 10) {
            return {
                minWidth: 16,
                tracking: '0.12em',
                fontSize: 'text-sm sm:text-base'
            };
        } else {
            return {
                minWidth: 18,
                tracking: '0.15em',
                fontSize: 'text-sm sm:text-base'
            };
        }
    }, [books.length]);

    // 鼠标垂直滚轮转换为横向滚动，提升桌面端浏览体验
    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (e.deltaY !== 0 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            e.currentTarget.scrollLeft += e.deltaY;
        }
    };

    return (
        <AnimatePresence>
            {showDock && (
                <motion.div
                    className="font-dock pointer-events-none fixed bottom-3 left-3 sm:left-4 z-50 max-w-[calc(100vw-1.5rem)] sm:max-w-[calc(100vw-3rem)] md:max-w-[75vw] lg:max-w-[85vw]"
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 80, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 140, damping: 20 }}
                >
                    <div
                        ref={scrollRef}
                        onWheel={handleWheel}
                        className="flex flex-nowrap items-end justify-start gap-1 sm:gap-1.5 overflow-x-auto overflow-y-hidden scrollbar-none py-1 px-1"
                        style={{
                            maskImage: 'linear-gradient(to right, black calc(100% - 32px), transparent 100%)',
                            WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 32px), transparent 100%)'
                        }}
                    >
                        {books.map((book, index) => (
                            <div key={book.id} className="pointer-events-auto flex-shrink-0">
                                <BookCard book={book} state="dock" index={index} dockConfig={dockConfig} />
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
