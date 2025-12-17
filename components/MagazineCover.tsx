'use client';

import { motion, useMotionValue } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useState, useRef } from 'react';
import SingleCard from './MagazineCover/SingleCard';
import DoubleCard from './MagazineCover/DoubleCard';
import TripleCard from './MagazineCover/TripleCard';

interface Month {
    id: string;
    label: string;
    vol: string;
    previewCards: string[];
    bookCount: number;
}

interface MagazineCoverProps {
    latestMonths: Month[];
}

export default function MagazineCover({ latestMonths }: MagazineCoverProps) {
    const router = useRouter();
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // 鼠标位置追踪
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        mouseX.set(x);
        mouseY.set(y);
    };

    const handleMouseLeave = () => {
        mouseX.set(0);
        mouseY.set(0);
        setHoveredIndex(null);
    };

    // 根据数据数量决定布局
    const count = latestMonths.length;

    // 单卡片布局
    if (count === 1) {
        const month = latestMonths[0];
        return (
            <motion.div
                className="relative w-full max-w-2xl mx-auto cursor-pointer h-[clamp(380px,60vw,540px)]"
                onMouseEnter={() => setHoveredIndex(0)}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => router.push(`/${month.id}`)}
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.3 }}
            >
                <SingleCard month={month} isHovered={hoveredIndex === 0} isLatest={true} />
            </motion.div>
        );
    }

    // 双卡片布局
    if (count === 2) {
        return (
            <div
                ref={containerRef}
                className="relative w-full"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                    {latestMonths.map((month, index) => (
                        <DoubleCard
                            key={month.id}
                            month={month}
                            index={index}
                            isHovered={hoveredIndex === index}
                            isLatest={index === 0}
                            onHover={() => setHoveredIndex(index)}
                            onClick={() => router.push(`/${month.id}`)}
                            mouseX={mouseX}
                            mouseY={mouseY}
                        />
                    ))}
                </div>
            </div>
        );
    }

    // 三卡片布局
    return (
        <div
            ref={containerRef}
            className="relative w-full perspective-1000"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ perspective: '1500px', maxHeight: '45vh' }}
        >
            <div className="relative flex items-center justify-center gap-2 md:gap-4">
                {latestMonths.map((month, index) => (
                    <TripleCard
                        key={month.id}
                        month={month}
                        index={index}
                        totalCount={count}
                        isHovered={hoveredIndex === index}
                        isLatest={index === 0}
                        onHover={() => setHoveredIndex(index)}
                        onClick={() => router.push(`/${month.id}`)}
                        mouseX={mouseX}
                        mouseY={mouseY}
                    />
                ))}
            </div>
        </div>
    );
}
