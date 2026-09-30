'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { MonthData } from '@/lib/content';

import PerspectiveStack from './PerspectiveStack';

interface MagazineCardProps {
    month: MonthData;
    isLatest?: boolean;
    className?: string;
}

const cardContainerVariants = {
    initial: { scale: 1 },
    hover: {
        scale: 1.02,
        transition: { duration: 0.35, ease: [0.2, 0, 0, 1] as const }
    }
};

export default function MagazineCard({ month, isLatest = false, className = '' }: MagazineCardProps) {
    const router = useRouter();
    // 优先使用竖版原版图书封面，若无则使用设计卡片预览
    const previewImages = (month.previewCovers && month.previewCovers.length > 0)
        ? month.previewCovers
        : month.previewCards;

    return (
        <motion.div
            className={`relative w-full cursor-pointer ${className}`}
            onClick={() => router.push(`/${month.id}`)}
            variants={cardContainerVariants}
            initial="initial"
            whileHover="hover"
        >
            <div className="relative w-full h-full overflow-hidden">
                {/* 3D 竖版透视堆叠画廊 */}
                <div className="absolute inset-0 pb-10 flex items-center justify-center">
                    <PerspectiveStack
                        images={previewImages}
                        title={month.label}
                        maxCards={5}
                    />
                </div>

                {/* Text Info - Bottom Aligned */}
                <div className="absolute inset-0 flex flex-col justify-end pb-8 pt-2 px-2 pointer-events-none z-30">
                    {isLatest && (
                        <div className="inline-flex items-center gap-2 mb-2 w-fit">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono border border-[#C9A063]/50 text-[#C9A063] bg-[#C9A063]/10">
                                LATEST
                            </span>
                        </div>
                    )}

                    <div className="flex items-center justify-between border-t border-[#C9A063]/30 pt-2">
                        <span className="font-body text-lg text-[#E8E6DC]/80">{month.vol}</span>
                        {month.bookCount > 0 && (
                            <span className="font-mono text-xs text-[#C9A063]/80">
                                {month.bookCount} BOOKS
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
