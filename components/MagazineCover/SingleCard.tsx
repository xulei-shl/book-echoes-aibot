'use client';

import { motion } from 'framer-motion';
import { BaseCardLayout, CardInfo, BookCollage } from './BaseCardComponents';

interface Month {
    id: string;
    label: string;
    vol: string;
    previewCards: string[];
    bookCount: number;
}

interface SingleCardProps {
    month: Month;
    isHovered: boolean;
    isLatest: boolean;
}

/**
 * 单卡片组件 - 多图拼贴式封面设计
 */
export default function SingleCard({ month, isHovered, isLatest }: SingleCardProps) {
    return (
        <div className="relative h-full rounded-[30px] overflow-hidden shadow-[0_35px_95px_-40px_rgba(40,22,12,0.65)]"
            style={{ backgroundColor: '#E8E6DC' }}>
            <BaseCardLayout month={month} isHovered={isHovered} isLatest={isLatest} isCenter={true}>
                <BookCollage previewCards={month.previewCards} isHovered={isHovered} isCenter={true} />
            </BaseCardLayout>

            {/* 文字信息层 */}
            <div className="absolute inset-0 flex flex-col justify-end p-8 pb-11 pointer-events-none"
                style={{ color: '#F2F0E9', zIndex: 30 }}>
                {isLatest && (
                    <motion.div
                        className="inline-flex items-center gap-2 mb-4 w-fit"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        <span className="px-3 py-1 backdrop-blur-sm rounded-full text-xs font-medium border"
                            style={{
                                backgroundColor: 'rgba(139, 58, 58, 0.3)',
                                borderColor: 'rgba(139, 58, 58, 0.5)',
                                color: '#F2F0E9',
                                textShadow: '2px 2px 4px rgba(0,0,0,0.8)'
                            }}>
                            最新期
                        </span>
                    </motion.div>
                )}

                <motion.h1
                    className="font-display text-4xl md:text-5xl mb-3"
                    style={{
                        textShadow: '3px 3px 6px rgba(0,0,0,0.9)',
                        color: '#F2F0E9'
                    }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                >
                    {month.label}
                </motion.h1>

                <motion.p
                    className="font-body text-xl md:text-2xl mb-2"
                    style={{
                        color: 'rgba(242, 240, 233, 0.9)',
                        textShadow: '2px 2px 4px rgba(0,0,0,0.8)'
                    }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                >
                    {month.vol}
                </motion.p>

                {month.bookCount > 0 && (
                    <motion.p
                        className="font-body text-sm"
                        style={{
                            color: 'rgba(242, 240, 233, 0.8)',
                            textShadow: '2px 2px 4px rgba(0,0,0,0.8)'
                        }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                    >
                        收录 {month.bookCount} 本书
                    </motion.p>
                )}
            </div>

            {/* 点击提示 */}
            <motion.div
                className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: isHovered ? 1 : 0 }}
                transition={{ duration: 0.2 }}
            >
                <span className="text-sm font-body" style={{ color: '#8B3A3A' }}>点击进入本期 →</span>
            </motion.div>
        </div>
    );
}
