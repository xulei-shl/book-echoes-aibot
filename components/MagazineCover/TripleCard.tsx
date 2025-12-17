'use client';

import { motion, useTransform } from 'framer-motion';
import { BaseCardLayout, CardInfo, BookCollage } from './BaseCardComponents';

interface Month {
    id: string;
    label: string;
    vol: string;
    previewCards: string[];
    bookCount: number;
}

interface TripleCardProps {
    month: Month;
    index: number;
    totalCount: number;
    isHovered: boolean;
    isLatest: boolean;
    onHover: () => void;
    onClick: () => void;
    mouseX: any;
    mouseY: any;
}

/**
 * 三卡片组件 - 拼贴式设计与高级动效
 */
export default function TripleCard({
    month,
    index,
    totalCount,
    isHovered,
    isLatest,
    onHover,
    onClick,
    mouseX,
    mouseY
}: TripleCardProps) {
    const isCenter = index === 0;
    const widthClass = isCenter ? 'w-[clamp(220px,26vw,280px)]' : 'w-[clamp(180px,22vw,240px)]';

    const getCardStyle = () => {
        if (totalCount === 3) {
            if (index === 0) return { scale: 1.05, rotate: 0, zIndex: 3 };
            if (index === 1) return { scale: 0.88, rotate: -8, zIndex: 1, x: -20 };
            if (index === 2) return { scale: 0.88, rotate: 8, zIndex: 1, x: 20 };
        }
        return { scale: 1, rotate: 0, zIndex: 1 };
    };

    const baseStyle = getCardStyle();
    const rotateX = useTransform(mouseY, [-300, 300], [10, -10]);
    const rotateY = useTransform(mouseX, [-300, 300], [-10, 10]);

    return (
        <motion.div
            className="relative cursor-pointer"
            onMouseEnter={onHover}
            onClick={onClick}
            initial={{ opacity: 0, y: 100, scale: 0.8 }}
            animate={{
                opacity: 1,
                y: 0,
                scale: isHovered ? baseStyle.scale * 1.1 : baseStyle.scale,
                rotate: isHovered ? 0 : baseStyle.rotate,
                x: isHovered ? 0 : baseStyle.x || 0,
                zIndex: isHovered ? 10 : baseStyle.zIndex,
            }}
            transition={{
                delay: index * 0.15,
                duration: 0.6,
                type: 'spring',
                stiffness: 100
            }}
            style={{
                rotateX: isHovered ? rotateX : 0,
                rotateY: isHovered ? rotateY : 0,
                transformStyle: 'preserve-3d',
            }}
        >
            {/* 深度阴影效果 */}
            <motion.div
                className="absolute inset-0 rounded-lg bg-black/20 blur-2xl"
                animate={{
                    scale: isHovered ? 1.1 : 0.9,
                    opacity: isHovered ? 0.5 : 0.2,
                }}
                style={{ transform: 'translateZ(-50px)' }}
            />

            <div className={`relative ${widthClass} aspect-[3/4] max-h-[36vh] rounded-[24px] overflow-hidden shadow-[0_25px_70px_-35px_rgba(30,20,12,0.55)]`}
                style={{ backgroundColor: '#E8E6DC' }}>
                <BaseCardLayout month={month} isHovered={isHovered} isLatest={isLatest} isCenter={isCenter}>
                    <motion.div
                        className="absolute inset-0"
                        animate={{
                            filter: isHovered ? 'blur(0px)' : (!isCenter ? 'blur(1px)' : 'blur(0px)'),
                        }}
                    >
                        <BookCollage previewCards={month.previewCards} isHovered={isHovered} isCenter={isCenter} />
                    </motion.div>
                </BaseCardLayout>

                {/* 文字信息 */}
                <CardInfo month={month} isLatest={isLatest} isCenter={isCenter} />
            </div>

            {/* 悬停提示 */}
            {isHovered && (
                <motion.div
                    className="absolute -bottom-12 left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                >
                    <span className="text-sm font-body" style={{ color: '#8B3A3A' }}>点击进入本期 →</span>
                </motion.div>
            )}
        </motion.div>
    );
}
