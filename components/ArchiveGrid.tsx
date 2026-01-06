'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Header from './Header';

interface Month {
    id: string;
    label: string;
    vol: string;
    previewCard?: string;
    bookCount: number;
}

interface ArchiveGridProps {
    months: Month[];
    aboutContent?: string;
}

export default function ArchiveGrid({ months, aboutContent }: ArchiveGridProps) {
    const router = useRouter();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    const handleMonthClick = (id: string) => {
        setSelectedId(id);
        // Wait for scale animation before navigating
        setTimeout(() => {
            router.push(`/${id}`);
        }, 400); // Match scale animation duration
    };

    // Calculate grid dimensions based on number of months
    // Aim for roughly square grid, prioritize 4 columns on desktop
    const getGridCols = () => {
        if (months.length <= 4) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';
        if (months.length <= 8) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';
        return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
    };

    // Helper to get the "Big Character" for the background
    const getBigMonthChar = (label: string, id: string) => {
        const map: Record<string, string> = {
            '一月': '壹', '二月': '贰', '三月': '叁', '四月': '肆',
            '五月': '伍', '六月': '陆', '七月': '柒', '八月': '捌',
            '九月': '玖', '十月': '拾', '十一月': '冬', '十二月': '腊',
            'January': '01', 'February': '02', 'March': '03', 'April': '04',
            'May': '05', 'June': '06', 'July': '07', 'August': '08',
            'September': '09', 'October': '10', 'November': '11', 'December': '12'
        };

        if (map[label]) return map[label];

        const parts = id.split('-');
        if (parts.length === 2) {
            const monthNum = parseInt(parts[1]);
            const bigChars = ['', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾', '冬', '腊'];
            if (monthNum >= 1 && monthNum <= 12) return bigChars[monthNum];
        }

        return label.charAt(0);
    };

    return (
        <div className="relative h-screen w-screen overflow-hidden bg-[#F2F0E9]">
            {/* Noise Texture for High-end Feel */}
            <div className="noise-overlay" />

            {/* Header with Logo */}
            <Header showHomeButton={true} aboutContent={aboutContent} />

            {/* 
                Main Grid - High-end "Double Line" Design
                - Container bg is the "Line Color" (Red Accent with low opacity for tastefulness)
                - Gap creates the lines
                - Cells are background colored
                - Added overflow-y-auto for scrolling
            */}
            <div className={`grid ${getGridCols()} h-full w-full gap-[2px] p-[2px] bg-[var(--accent-interactive)]/30 overflow-y-auto pt-24 pb-12`}>
                {months.map((month) => {
                    const bigChar = getBigMonthChar(month.label, month.id);
                    const isHovered = hoveredId === month.id;
                    const year = month.id.split('-')[0];

                    return (
                        <motion.div
                            key={month.id}
                            className="relative overflow-hidden cursor-pointer group bg-[#F2F0E9] min-h-[400px]"
                            onClick={() => handleMonthClick(month.id)}
                            onMouseEnter={() => setHoveredId(month.id)}
                            onMouseLeave={() => setHoveredId(null)}
                        >
                            {/* 
                                1. Background Typography Layer 
                                Huge, watermarked character. 
                                Positioned to be cut off/dynamic.
                            */}
                            <div className="absolute -bottom-10 -left-10 z-0 pointer-events-none select-none overflow-hidden">
                                <motion.span
                                    className="font-display text-[12rem] md:text-[16rem] leading-none text-[var(--accent-interactive)]"
                                    initial={{ opacity: 0.03, x: 0 }}
                                    animate={{
                                        opacity: isHovered ? 0.08 : 0.03,
                                        x: isHovered ? 20 : 0,
                                        scale: isHovered ? 1.05 : 1
                                    }}
                                    transition={{ duration: 0.6, ease: "easeOut" }}
                                >
                                    {bigChar}
                                </motion.span>
                            </div>

                            {/* 
                                2. Content Layer 
                                Minimalist, Swiss-style layout.
                            */}
                            <div className="absolute inset-0 z-10 flex flex-col justify-between p-6 md:p-8">
                                {/* Top: Volume Number & Year (Small, Technical) */}
                                <div className="flex justify-between items-start">
                                    <div className="flex flex-col gap-1">
                                        <span className="font-body text-xs md:text-sm tracking-[0.2em] text-[var(--accent-interactive)] uppercase opacity-80">
                                            {year}
                                        </span>
                                        <span className="font-body text-xs md:text-sm tracking-[0.2em] text-[var(--accent-interactive)] uppercase opacity-60">
                                            {month.vol}
                                        </span>
                                    </div>
                                    {/* Decorative small square */}
                                    <motion.div
                                        className="w-1.5 h-1.5 bg-[var(--accent-interactive)]"
                                        animate={{ opacity: isHovered ? 1 : 0.3 }}
                                    />
                                </div>

                                {/* Center/Bottom: Month Label */}
                                <div className="flex flex-col items-start gap-2 mt-auto">
                                    <motion.div
                                        className="h-[1px] bg-[var(--foreground)] origin-left"
                                        initial={{ width: '2rem' }}
                                        animate={{ width: isHovered ? '4rem' : '2rem' }}
                                        transition={{ duration: 0.4 }}
                                    />
                                    <h2 className="font-display text-4xl md:text-5xl lg:text-6xl text-[var(--foreground)] tracking-wide">
                                        {month.label}
                                    </h2>
                                    {month.bookCount > 0 && (
                                        <span className="font-body text-xs text-[var(--foreground)]/50 tracking-[0.1em]">
                                            {month.bookCount} Editions
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* 
                                3. Image Preview Layer (The "Peek")
                                Refined to be more subtle and integrated.
                            */}
                            {month.previewCard && (
                                <motion.div
                                    className="absolute top-1/2 right-8 w-32 h-48 md:w-40 md:h-60 z-20 pointer-events-none"
                                    initial={{ opacity: 0, x: 50, rotate: 5 }}
                                    animate={{
                                        opacity: isHovered ? 1 : 0,
                                        x: isHovered ? 0 : 50,
                                        rotate: isHovered ? -5 : 5,
                                        scale: isHovered ? 1 : 0.9
                                    }}
                                    transition={{
                                        type: "spring",
                                        stiffness: 150,
                                        damping: 20
                                    }}
                                >
                                    <div className="relative w-full h-full shadow-2xl bg-white p-1.5 border border-gray-100 rotate-3">
                                        <div className="relative w-full h-full overflow-hidden">
                                            <Image
                                                src={month.previewCard}
                                                alt={`${month.label} preview`}
                                                fill
                                                className="object-cover"
                                                sizes="(max-width: 768px) 128px, 160px"
                                            />
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* Hover Overlay (Subtle Tint) */}
                            <motion.div
                                className="absolute inset-0 bg-[var(--accent-interactive)] pointer-events-none"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: isHovered ? 0.02 : 0 }}
                            />
                        </motion.div>
                    );
                })}
            </div>

            {/* Scale Expansion Overlay */}
            <AnimatePresence>
                {selectedId && (
                    <motion.div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-[#F2F0E9]"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{
                            duration: 0.5,
                            ease: [0.22, 1, 0.36, 1]
                        }}
                    >
                        <div className="flex flex-col items-center justify-center">
                            <motion.h2
                                className="font-display text-6xl md:text-8xl text-[var(--foreground)] mb-6"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                            >
                                {months.find(m => m.id === selectedId)?.label}
                            </motion.h2>
                            <motion.div
                                className="h-[1px] w-24 bg-[var(--accent-interactive)] mb-6"
                                initial={{ width: 0 }}
                                animate={{ width: 96 }}
                                transition={{ delay: 0.3 }}
                            />
                            <motion.span
                                className="font-body text-xl md:text-2xl text-[var(--accent-interactive)] tracking-widest"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.4 }}
                            >
                                {months.find(m => m.id === selectedId)?.vol}
                            </motion.span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
