'use client';

import { motion, PanInfo } from 'framer-motion';
import Image from 'next/image';
import { Book } from '@/types';
import { useStore } from '@/store/useStore';
import { useRef, useState, useEffect, useMemo } from 'react';

interface ScatterCardProps {
    book: Book;
    index: number;
    scatterTarget: { x: number; y: number; rotation: number };
    storedScatterPosition: { x: number; y: number; rotation: number } | undefined;
    dragConstraints: { left: number; right: number; top: number; bottom: number };
    maxW: number;
    maxH: number;
    isHovered: boolean;
    cardRef: React.RefObject<HTMLDivElement | null>;
    onHoverStart: () => void;
    onHoverEnd: () => void;
    onPointerMove: (event: React.PointerEvent) => void;
}

const CARD_WIDTH = 192;
const CARD_HEIGHT = 288;

export default function ScatterCard({
    book,
    index,
    scatterTarget,
    storedScatterPosition,
    dragConstraints,
    maxW,
    maxH,
    isHovered,
    cardRef,
    onHoverStart,
    onHoverEnd,
    onPointerMove
}: ScatterCardProps) {
    const { setFocusedBookId, setScatterPosition } = useStore();
    const isDragging = useRef(false);
    const [currentZIndex, setCurrentZIndex] = useState(10);
    const latestScatterPosition = useRef<{ x: number; y: number; rotation: number } | null>(null);

    useEffect(() => {
        latestScatterPosition.current = scatterTarget;
    }, [scatterTarget.x, scatterTarget.y, scatterTarget.rotation]);

    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

    const handleDragStart = () => {
        isDragging.current = true;
        setCurrentZIndex(80);
    };

    const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        const basePosition = latestScatterPosition.current ?? scatterTarget;
        const rightLimit = dragConstraints.right || maxW;
        const bottomLimit = dragConstraints.bottom || maxH;
        const constrained = {
            x: clamp(basePosition.x + info.offset.x, dragConstraints.left, rightLimit),
            y: clamp(basePosition.y + info.offset.y, dragConstraints.top, bottomLimit),
            rotation: basePosition.rotation
        };
        setScatterPosition(book.id, constrained);
        latestScatterPosition.current = constrained;

        // 延迟重置拖拽状态,防止点击事件触发
        setTimeout(() => {
            isDragging.current = false;
            setCurrentZIndex(10);
        }, 100);
    };

    const scatterInitial = storedScatterPosition ? {
        x: scatterTarget.x,
        y: scatterTarget.y,
        scale: 1,
        opacity: 1,
        rotate: scatterTarget.rotation
    } : {
        x: scatterTarget.x,
        y: scatterTarget.y,
        scale: 0.9,
        opacity: 0,
        rotate: scatterTarget.rotation
    };

    return (
        <motion.div
            ref={cardRef}
            layoutId={`book-${book.id}`}
            className="absolute w-48 h-72 cursor-grab active:cursor-grabbing shadow-lg hover:shadow-2xl"
            drag
            dragConstraints={dragConstraints}
            dragMomentum={false}
            dragElastic={0.1}
            whileDrag={{ scale: 1.1, rotate: 0 }}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onHoverStart={onHoverStart}
            onHoverEnd={onHoverEnd}
            onPointerMove={onPointerMove}
            initial={scatterInitial}
            animate={{
                x: scatterTarget.x,
                y: scatterTarget.y,
                scale: 1,
                opacity: 1,
                rotate: scatterTarget.rotation
            }}
            transition={{
                type: "spring",
                stiffness: 80,
                damping: 15,
                mass: 1,
                delay: index * 0.02 // 轻微的交错效果
            }}
            onClick={() => {
                // 仅在非拖拽状态下聚焦
                if (!isDragging.current) {
                    setFocusedBookId(book.id);
                }
            }}
            style={{ zIndex: isHovered ? 120 : currentZIndex }}
            suppressHydrationWarning
        >
            <Image
                src={book.coverThumbnailUrl || book.coverUrl}
                alt={book.title}
                fill
                sizes="(max-width: 768px) 50vw, 192px"
                className="object-cover rounded-md pointer-events-none"
                loading={index < 6 ? 'eager' : 'lazy'}
                priority={index < 3}
            />
        </motion.div>
    );
}
