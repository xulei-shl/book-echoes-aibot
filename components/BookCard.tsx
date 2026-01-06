'use client';

import { Book } from '@/types';
import { useStore } from '@/store/useStore';
import { seededRandoms } from '@/lib/seededRandom';
import { useRef, useState, useEffect, useMemo } from 'react';
import DockCard from './BookCard/DockCard';
import FocusedCard from './BookCard/FocusedCard';
import ScatterCard from './BookCard/ScatterCard';
import HoverPreview from './BookCard/HoverPreview';
import { usePreviewPosition } from './BookCard/usePreviewPosition';
import { useHoverHandlers } from './BookCard/useHoverHandlers';
import { DockCardConfig } from './Dock';

interface BookCardProps {
    book: Book;
    state: 'scatter' | 'focused' | 'dock';
    index?: number;
    dockConfig?: DockCardConfig;
}

const CARD_WIDTH = 192;
const CARD_HEIGHT = 288;

export default function BookCard({ book, state, index = 0, dockConfig }: BookCardProps) {
    const { focusedBookId, scatterPositions, setScatterPosition } = useStore();
    const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });
    const cardRef = useRef<HTMLDivElement>(null);
    const [dragConstraints, setDragConstraints] = useState({ left: 0, right: 0, top: 0, bottom: 0 });


    // 窗口尺寸监听
    useEffect(() => {
        const updateSize = () => {
            setWindowSize({ width: window.innerWidth, height: window.innerHeight });
        };
        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    const maxW = windowSize.width > 0 ? windowSize.width - CARD_WIDTH - 40 : 1720;
    const maxH = windowSize.height > 0 ? windowSize.height - CARD_HEIGHT - 40 : 780;
    const isFocused = focusedBookId === book.id;

    // 使用自定义 hooks
    const { previewPosition, updatePreviewPosition } = usePreviewPosition(false, cardRef);
    const {
        isHovered,
        setIsHovered,
        handleHoverStart,
        handleHoverEnd,
        handlePointerMove
    } = useHoverHandlers(state, cardRef, updatePreviewPosition);

    // focused 状态下清除悬停
    useEffect(() => {
        if (state === 'focused') {
            setIsHovered(false);
        }
    }, [state, setIsHovered]);

    // 计算散落位置
    const [randX, randY, randRot] = seededRandoms(book.id, 3);
    const initialScatterPosition = useMemo(() => {
        let x = randX * maxW;
        let y = randY * maxH;

        // 避开左下角 Dock 区域
        const isBottomLeft = x < maxW * 0.4 && y > maxH * 0.6;
        if (isBottomLeft) {
            x += maxW * 0.4;
        }

        return {
            x,
            y,
            rotation: randRot * 30 - 15
        };
    }, [randX, randY, randRot, maxW, maxH]);

    const storedScatterPosition = scatterPositions[book.id];

    // 计算拖拽约束
    useEffect(() => {
        if (state === 'scatter' && typeof window !== 'undefined') {
            setDragConstraints({
                left: 0,
                right: window.innerWidth - CARD_WIDTH,
                top: 0,
                bottom: window.innerHeight - CARD_HEIGHT
            });
        }
    }, [state]);

    // 初始化散落位置
    useEffect(() => {
        if (state === 'scatter' && !storedScatterPosition && windowSize.width > 0) {
            setScatterPosition(book.id, initialScatterPosition);
        }
    }, [state, storedScatterPosition, book.id, initialScatterPosition, setScatterPosition, windowSize.width]);

    const scatterTarget = storedScatterPosition ?? initialScatterPosition;

    // 预览图片源
    const previewImageSrc = state === 'dock'
        ? (book.cardThumbnailUrl || book.cardImageUrl || book.coverThumbnailUrl || book.coverUrl)
        : (book.cardImageUrl || book.coverUrl);

    // 根据状态渲染不同的卡片
    const shouldRenderHoverPreview = state !== 'focused';

    let cardContent: React.ReactElement | null = null;

    if (state === 'dock') {
        cardContent = (
            <DockCard
                book={book}
                index={index}
                isHovered={isHovered}
                cardRef={cardRef}
                onHoverStart={handleHoverStart}
                onHoverEnd={handleHoverEnd}
                config={dockConfig}
            />
        );
    } else if (state === 'focused') {
        cardContent = <FocusedCard book={book} isFocused={isFocused} />;
    } else {
        cardContent = (
            <ScatterCard
                book={book}
                index={index}
                scatterTarget={scatterTarget}
                storedScatterPosition={storedScatterPosition}
                dragConstraints={dragConstraints}
                maxW={maxW}
                maxH={maxH}
                isHovered={isHovered}
                cardRef={cardRef}
                onHoverStart={handleHoverStart}
                onHoverEnd={handleHoverEnd}
                onPointerMove={handlePointerMove}
            />
        );
    }

    return (
        <>
            {shouldRenderHoverPreview && (
                <HoverPreview
                    isVisible={isHovered}
                    position={previewPosition}
                    imageSrc={previewImageSrc}
                    alt={`${book.title} cover preview`}
                />
            )}
            {cardContent}
        </>
    );
}
