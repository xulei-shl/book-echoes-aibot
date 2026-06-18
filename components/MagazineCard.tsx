'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import { MonthData } from '@/lib/content';

interface MagazineCardProps {
    month: MonthData;
    isLatest?: boolean;
    className?: string;
}

export default function MagazineCard({ month, isLatest = false, className = '' }: MagazineCardProps) {
    const router = useRouter();
    const [isHovered, setIsHovered] = useState(false);
    const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
    const previewCards = month.previewCards;

    const onMainLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        setNaturalRatio(img.naturalWidth / img.naturalHeight);
    }, []);

    const containerAspect = naturalRatio ?? (3 / 4);
    const isLandscape = naturalRatio !== null && naturalRatio >= 1;
    const containerSizing = isLandscape ? 'w-4/5 max-h-[70%]' : 'w-3/5 max-h-[85%]';

    return (
        <motion.div
            className={`relative w-full cursor-pointer ${className}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => router.push(`/${month.id}`)}
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.3 }}
        >
            <div className="relative w-full h-full overflow-hidden">
                {previewCards.length > 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center px-6 pt-8 pb-20">
                        <motion.div
                            className={`relative ${containerSizing} rounded-sm shadow-2xl overflow-hidden`}
                            animate={{ scale: isHovered ? 1.05 : 1, rotate: isHovered ? 0 : -2 }}
                            transition={{ duration: 0.4 }}
                            style={{ aspectRatio: containerAspect, zIndex: 10 }}
                        >
                            <Image
                                src={previewCards[0]}
                                alt={month.label}
                                fill
                                className="object-cover"
                                priority
                                sizes="(max-width: 768px) 60vw, 300px"
                                onLoad={onMainLoad}
                            />
                            <div className="absolute inset-0 rounded-sm border border-white/20 pointer-events-none" />
                        </motion.div>
                    </div>
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center text-[#C9A063]/40">
                            <p className="font-display text-sm">等待书籍归档</p>
                        </div>
                    </div>
                )}

                <div className="absolute inset-0 flex flex-col justify-end p-6 pointer-events-none z-30">
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
