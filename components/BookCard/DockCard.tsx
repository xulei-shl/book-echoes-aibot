'use client';

import { motion } from 'framer-motion';
import { Book } from '@/types';
import { useStore } from '@/store/useStore';
import { DockCardConfig } from '../Dock';

interface DockCardProps {
    book: Book;
    index: number;
    isHovered: boolean;
    cardRef: React.RefObject<HTMLDivElement | null>;
    onHoverStart: () => void;
    onHoverEnd: () => void;
    config?: DockCardConfig;
}

export default function DockCard({
    book,
    index,
    isHovered,
    cardRef,
    onHoverStart,
    onHoverEnd,
    config
}: DockCardProps) {
    const { setFocusedBookId } = useStore();

    const normalizedTitle = book.title.trim();
    const normalizedSubtitle = book.subtitle?.trim();
    const dockLabel = normalizedSubtitle ? `${normalizedTitle} : ${normalizedSubtitle}` : normalizedTitle;
    const dockVerticalText = dockLabel.replace(/\s+/g, '').split('').join('\n');

    // 旋转细微的灰度色调,使每个标题感觉独特
    const toneSlot = index % 7;
    const dockOpacity = 0.5 + (toneSlot * 0.06); // 范围: 0.5 - 0.92
    const dockTextStyle = {
        color: '#E8E6DC',
        opacity: dockOpacity
    };

    // 使用配置参数或默认值
    const minWidth = config?.minWidth ?? 24;
    const tracking = config?.tracking ?? '0.3em';
    const fontSize = config?.fontSize ?? 'text-lg';

    return (
        <motion.div
            ref={cardRef}
            className={`relative h-32 cursor-pointer transition-transform duration-200 ease-out flex items-end justify-center`}
            style={{
                minWidth: `${minWidth}px`,
                zIndex: isHovered ? 120 : undefined
            }}
            onClick={() => setFocusedBookId(book.id)}
            whileHover={{ y: -10 }}
            onHoverStart={onHoverStart}
            onHoverEnd={onHoverEnd}
            title={dockLabel}
            aria-label={dockLabel}
        >
            <span
                className={`font-dock ${fontSize} whitespace-pre text-center`}
                style={{
                    ...dockTextStyle,
                    letterSpacing: tracking,
                    lineHeight: '1.75rem'
                }}
            >
                {dockVerticalText}
            </span>
        </motion.div>
    );
}
