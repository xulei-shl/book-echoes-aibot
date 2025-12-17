'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MonthData } from '@/lib/content';

interface MagazineCardProps {
    month: MonthData;
    isLatest?: boolean;
    className?: string;
}

export default function MagazineCard({ month, isLatest = false, className = '' }: MagazineCardProps) {
    const router = useRouter();
    const [isHovered, setIsHovered] = useState(false);
    const previewCards = month.previewCards;

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
                {/* Book Cover Collage */}
                {previewCards.length > 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center px-4 pt-8 pb-20">
                        {/* Stacked Books */}
                        {previewCards.length >= 4 && (
                            <div
                                className="absolute w-1/3 aspect-[2/3] rounded-sm shadow-lg bg-[#E8E6DC]"
                                style={{
                                    zIndex: 1,
                                    transform: 'translate(50%, -25%) rotate(18deg)',
                                    opacity: 0.5
                                }}
                            >
                                <Image src={previewCards[3]} alt="Book 4" fill className="object-cover rounded-sm" sizes="150px" />
                            </div>
                        )}

                        {previewCards.length >= 3 && (
                            <div
                                className="absolute w-1/3 aspect-[2/3] rounded-sm shadow-lg bg-[#E8E6DC]"
                                style={{
                                    zIndex: 2,
                                    transform: 'translate(-50%, -20%) rotate(-15deg)',
                                    opacity: 0.6
                                }}
                            >
                                <Image src={previewCards[2]} alt="Book 3" fill className="object-cover rounded-sm" sizes="150px" />
                            </div>
                        )}

                        {previewCards.length >= 2 && (
                            <div
                                className="absolute w-2/5 aspect-[2/3] rounded-sm shadow-xl bg-[#E8E6DC]"
                                style={{
                                    zIndex: 3,
                                    transform: 'translate(25%, -5%) rotate(8deg)',
                                    opacity: 0.75
                                }}
                            >
                                <Image src={previewCards[1]} alt="Book 2" fill className="object-cover rounded-sm" sizes="150px" />
                            </div>
                        )}

                        {/* Main Cover */}
                        <motion.div
                            className="relative w-3/5 aspect-[2/3] rounded-sm shadow-2xl bg-[#E8E6DC]"
                            animate={{
                                scale: isHovered ? 1.05 : 1,
                                rotate: isHovered ? 0 : -2
                            }}
                            transition={{ duration: 0.4 }}
                            style={{ zIndex: 10 }}
                        >
                            <Image
                                src={previewCards[0]}
                                alt={month.label}
                                fill
                                className="object-cover rounded-sm"
                                priority
                                sizes="(max-width: 768px) 60vw, 300px"
                            />
                            {/* Border Highlight */}
                            <div className="absolute inset-0 rounded-sm border border-white/20" />
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
