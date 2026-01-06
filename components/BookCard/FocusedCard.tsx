'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { Book } from '@/types';
import { useStore } from '@/store/useStore';
import { seededRandoms } from '@/lib/seededRandom';

interface FocusedCardProps {
    book: Book;
    isFocused: boolean;
}

export default function FocusedCard({ book, isFocused }: FocusedCardProps) {
    const { focusedBookId } = useStore();

    if (isFocused) {
        return (
            <motion.div
                layoutId={`book-${book.id}`}
                className="absolute left-[10%] top-[10%] w-[30%] h-[80%] z-50 shadow-2xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
                <Image
                    src={book.coverUrl}
                    alt={book.title}
                    fill
                    sizes="30vw"
                    className="object-contain rounded-md"
                    priority={true}
                />
            </motion.div>
        );
    }

    // 背景模糊卡片
    const [backgroundX, backgroundY, backgroundRot] = seededRandoms(book.id, 3);
    const viewportWidth = 1920;
    const viewportHeight = 1080;

    return (
        <motion.div
            className="absolute w-48 h-72 opacity-5 pointer-events-none grayscale blur-sm"
            initial={false}
            animate={{
                x: backgroundX * viewportWidth,
                y: backgroundY * viewportHeight,
                rotate: backgroundRot * 30 - 15
            }}
            suppressHydrationWarning
        >
            <Image
                src={book.coverThumbnailUrl || book.coverUrl}
                alt={book.title}
                fill
                sizes="192px"
                className="object-cover rounded-md"
                loading="lazy"
                priority={false}
            />
        </motion.div>
    );
}
