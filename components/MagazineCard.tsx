'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { MonthData } from '@/lib/content';

interface MagazineCardProps {
    month: MonthData;
    isLatest?: boolean;
    className?: string;
}

export default function MagazineCard({ month, isLatest = false, className = '' }: MagazineCardProps) {
    const router = useRouter();
    const previewCards = month.previewCards;

    return (
        <motion.div
            className={`relative w-full cursor-pointer ${className}`}
            onClick={() => router.push(`/${month.id}`)}
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.3 }}
        >
            <div className="relative w-full h-full overflow-hidden">
                {/* Book Cover Collage */}
                {previewCards.length > 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <motion.div
                            className="relative w-[90%] h-[85%] rounded-sm shadow-2xl"
                        >
                            <Image
                                src={previewCards[0]}
                                alt={month.label}
                                fill
                                className="object-contain rounded-sm drop-shadow-[0_15px_35px_rgba(0,0,0,0.5)]"
                                priority
                                sizes="(max-width: 768px) 60vw, 300px"
                            />
                        </motion.div>
                    </div>
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center text-[#C9A063]/40">
                            <p className="font-display text-sm">等待书籍归档</p>
                        </div>
                    </div>
                )}

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
