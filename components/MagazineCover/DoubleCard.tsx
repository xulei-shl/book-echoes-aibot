'use client';

import { motion, useTransform } from 'framer-motion';
import { BaseCardLayout, BookCollage } from './BaseCardComponents';

interface Month {
    id: string;
    label: string;
    vol: string;
    previewCards: string[];
    bookCount: number;
}

interface DoubleCardProps {
    month: Month;
    index: number;
    isHovered: boolean;
    isLatest: boolean;
    onHover: () => void;
    onClick: () => void;
    mouseX: any;
    mouseY: any;
}

/**
 * 双卡片组件 - 多图拼贴设计
 */
export default function DoubleCard({
    month,
    index,
    isHovered,
    isLatest,
    onHover,
    onClick,
    mouseX,
    mouseY
}: DoubleCardProps) {
    const rotateX = useTransform(mouseY, [-300, 300], [5, -5]);
    const rotateY = useTransform(mouseX, [-300, 300], [-5, 5]);

    return (
        <motion.div
            className="relative cursor-pointer"
            onMouseEnter={onHover}
            onClick={onClick}
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1, duration: 0.6 }}
            whileHover={{ scale: 1.05, zIndex: 10 }}
            style={{
                rotateX: isHovered ? rotateX : 0,
                rotateY: isHovered ? rotateY : 0,
            }}
        >
            <div className="relative w-full h-[clamp(360px,48vw,460px)] rounded-[28px] overflow-hidden shadow-[0_25px_80px_-30px_rgba(52,28,20,0.55)]"
                style={{ backgroundColor: '#E8E6DC' }}>
                <BaseCardLayout month={month} isHovered={isHovered} isLatest={isLatest}>
                    <BookCollage previewCards={month.previewCards} isHovered={isHovered} />
                </BaseCardLayout>

                {/* 文字信息 */}
                <div className="absolute inset-0 flex flex-col justify-end px-7 pt-6 pb-10 pointer-events-none"
                    style={{ color: '#F2F0E9', zIndex: 20 }}>
                    {isLatest && (
                        <span className="inline-flex items-center gap-2 mb-3 w-fit px-2 py-1 backdrop-blur-sm rounded-full text-xs font-medium border"
                            style={{
                                backgroundColor: 'rgba(139, 58, 58, 0.3)',
                                borderColor: 'rgba(139, 58, 58, 0.5)'
                            }}>
                            最新期
                        </span>
                    )}
                    <h2 className="font-display text-2xl md:text-3xl mb-2"
                        style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.3)' }}>
                        {month.label}
                    </h2>
                    <p className="font-body text-lg mb-1" style={{ color: 'rgba(242, 240, 233, 0.9)' }}>
                        {month.vol}
                    </p>
                    {month.bookCount > 0 && (
                        <p className="font-body text-xs" style={{ color: 'rgba(242, 240, 233, 0.8)' }}>
                            收录 {month.bookCount} 本书
                        </p>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
