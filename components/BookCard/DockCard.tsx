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

// 将文本中的 1-2 位数字包裹为纵中横 (Tate-chu-yoko)，其余字符保持自然竖排
function renderVerticalText(text: string) {
    const segments = text.split(/(\b\d{1,2}\b)/g);
    if (segments.length === 1) return text;
    return segments.map((seg, i) => {
        if (/^\d{1,2}$/.test(seg)) {
            return (
                <span
                    key={i}
                    style={{
                        textCombineUpright: 'all',
                        WebkitTextCombine: 'horizontal' as unknown as string
                    }}
                >
                    {seg}
                </span>
            );
        }
        return seg;
    });
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
    // 完整标题用于可访问性与原生 tooltip
    const fullLabel = normalizedSubtitle ? `${normalizedTitle} : ${normalizedSubtitle}` : normalizedTitle;

    // 旋转细微的灰度色调,使每个标题感觉独特
    const toneSlot = index % 7;
    const dockOpacity = isHovered ? 1 : 0.52 + (toneSlot * 0.06); // 范围: 0.52 - 0.88, hover 时 1
    const dockTextStyle: React.CSSProperties = {
        color: isHovered ? '#FFFFFF' : '#E8E6DC',
        opacity: dockOpacity,
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
        letterSpacing: config?.tracking ?? '0.12em',
        lineHeight: 1.15
    };

    // 使用配置参数或默认值
    const minWidth = config?.minWidth ?? 16;
    const fontSize = config?.fontSize ?? 'text-sm sm:text-base';

    return (
        <motion.div
            ref={cardRef}
            className="relative cursor-pointer transition-transform duration-200 ease-out flex items-end justify-center max-h-[min(42vh,280px)] select-none px-0.5"
            style={{
                minWidth: `${minWidth}px`,
                zIndex: isHovered ? 120 : undefined
            }}
            onClick={() => setFocusedBookId(book.id)}
            whileHover={{ y: -4 }}
            onHoverStart={onHoverStart}
            onHoverEnd={onHoverEnd}
            title={fullLabel}
            aria-label={fullLabel}
        >
            <span
                className={`font-dock ${fontSize} py-1 text-center transition-all duration-200 overflow-hidden text-ellipsis`}
                style={{
                    ...dockTextStyle,
                    maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%)',
                    WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 80%, rgba(0,0,0,0) 100%)'
                }}
            >
                {renderVerticalText(normalizedTitle)}
            </span>
        </motion.div>
    );
}
