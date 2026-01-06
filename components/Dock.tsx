'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Book } from '@/types';
import BookCard from './BookCard';
import { useStore } from '@/store/useStore';
import { useMemo } from 'react';

interface DockProps {
    books: Book[];
}

// Dock 卡片动态配置类型
export interface DockCardConfig {
    minWidth: number;
    tracking: string;
    fontSize: string;
    maxWidth: string;
}

export default function Dock({ books }: DockProps) {
    const { focusedBookId } = useStore();
    const showDock = !focusedBookId;

    // 根据书籍数量动态计算配置参数
    const dockConfig = useMemo<DockCardConfig>(() => {
        const bookCount = books.length;

        // 根据书籍数量分段调整参数
        if (bookCount > 20) {
            return {
                minWidth: 18,
                tracking: '0.05em',
                fontSize: 'text-sm',
                maxWidth: '35vw'
            };
        } else if (bookCount > 15) {
            return {
                minWidth: 20,
                tracking: '0.1em',
                fontSize: 'text-base',
                maxWidth: '36vw'
            };
        } else if (bookCount > 10) {
            return {
                minWidth: 22,
                tracking: '0.2em',
                fontSize: 'text-lg',
                maxWidth: '37vw'
            };
        } else {
            return {
                minWidth: 24,
                tracking: '0.3em',
                fontSize: 'text-lg',
                maxWidth: '38vw'
            };
        }
    }, [books.length]);

    return (
        <AnimatePresence>
            {showDock && (
                <motion.div
                    className="font-dock pointer-events-none fixed bottom-3 left-3 flex flex-wrap justify-start gap-2.5 z-50"
                    style={{ maxWidth: dockConfig.maxWidth }}
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 80, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 140, damping: 20 }}
                >
                    {books.map((book, index) => (
                        <div key={book.id} className="pointer-events-auto">
                            <BookCard book={book} state="dock" index={index} dockConfig={dockConfig} />
                        </div>
                    ))}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
