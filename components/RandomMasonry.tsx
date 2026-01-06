'use client';

import { useState, useEffect } from 'react';
import { Book } from '@/types';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface RandomMasonryProps {
    initialBooks: Book[];
}

interface LineParticle {
    id: number;
    orientation: 'h' | 'v';
    x: number;
    y: number;
    length: string;
    duration: number;
    delay: number;
}

// 固定的线条配置 - 使用质数分布模拟随机感，避免每次重新计算
const FIXED_LINES: LineParticle[] = [...Array(80)].map((_, i) => ({
    id: i,
    orientation: (i % 2 === 0 ? 'h' : 'v') as 'h' | 'v',
    x: (i * 13.7) % 100,  // 使用质数13.7实现伪随机分布
    y: (i * 17.3) % 100,  // 使用质数17.3实现伪随机分布
    length: ((i * 23) % 200 + 100) + 'px',  // 长度范围: 100-300px
    duration: (i % 10) + 15,  // 动画时长: 15-24秒
    delay: (i % 20) * 0.5  // 延迟: 0-9.5秒
}));

export default function RandomMasonry({ initialBooks }: RandomMasonryProps) {
    const [books, setBooks] = useState(initialBooks);
    const router = useRouter();
    const baseCardHeight = 360;
    const heightVariants = [1.05, 1.3, 1.55, 1.2];

    useEffect(() => {
        // 只需要随机排序书籍，线条使用固定配置
        setBooks([...initialBooks].sort(() => Math.random() - 0.5));
    }, [initialBooks]);

    const shuffle = () => {
        setBooks(prev => [...prev].sort(() => Math.random() - 0.5));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const getLabel = (sourceId: string) => {
        if (sourceId.includes('-sleeping-')) {
            const name = sourceId.split('-sleeping-')[1];
            return `睡美人 · ${decodeURIComponent(name)}`;
        }
        if (sourceId.includes('-subject-')) {
            const name = sourceId.split('-subject-')[1];
            return `主题 · ${decodeURIComponent(name)}`;
        }
        return sourceId; // Month case: YYYY-MM
    };

    const getCardHeight = (index: number) => baseCardHeight * heightVariants[index % heightVariants.length];

    return (
        <div className="relative min-h-screen overflow-hidden bg-[#0b0b0b] text-[#F2F0E9]">
            {/* Noise Texture - 调整z-index避免遮挡背景 */}
            <div className="noise-overlay" style={{ zIndex: 20 }} />

            {/* 背景层：漂浮的线条网络 */}
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                {/* 基础暗色渐变 */}
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: 'linear-gradient(180deg, #050505 0%, #121212 100%)'
                    }}
                />

                {/* 漂浮线条 - 模拟解构的网格 */}
                <div className="absolute inset-0">
                    {FIXED_LINES.map((line) => (
                        <motion.div
                            key={line.id}
                            className="absolute bg-[#C9A063]/50"
                            style={{
                                left: `${line.x}%`,
                                top: `${line.y}%`,
                                width: line.orientation === 'h' ? line.length : '2px',
                                height: line.orientation === 'v' ? line.length : '2px',
                                boxShadow: '0 0 15px rgba(201, 160, 99, 0.1), 0 0 30px rgba(201, 160, 99, 0.05)'
                            }}
                            animate={{
                                x: line.orientation === 'h' ? [-50, 50, -50] : 0,
                                y: line.orientation === 'v' ? [-50, 50, -50] : 0,
                                opacity: [0.3, 0.6, 0.3]
                            }}
                            transition={{
                                duration: line.duration,
                                repeat: Infinity,
                                ease: "linear",
                                delay: line.delay
                            }}
                        />
                    ))}
                </div>

                {/* 柔和光晕 - 增强可见度 */}
                <div
                    className="absolute inset-0 opacity-100"
                    style={{
                        backgroundImage: `
                            radial-gradient(circle at 15% 20%, rgba(212, 165, 116, 0.08), transparent 45%),
                            radial-gradient(circle at 85% 80%, rgba(201, 160, 99, 0.06), transparent 45%),
                            radial-gradient(circle at 50% 50%, rgba(214, 131, 97, 0.05), transparent 60%)
                        `,
                        filter: 'blur(60px)'
                    }}
                />
            </div>

            {/* Header Navigation */}
            <div className="fixed top-0 left-0 right-0 z-50 flex justify-center items-start pt-6 pointer-events-none">
                <div className="flex items-center gap-3 pointer-events-auto">
                    <Link href="/" className="btn-random px-4 py-2 md:px-5 md:py-2.5 text-sm md:text-base font-body tracking-widest">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        <span>首页</span>
                    </Link>
                    <Link href="/archive" className="btn-random px-4 py-2 md:px-5 md:py-2.5 text-sm md:text-base font-body tracking-widest">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        <span>往期</span>
                    </Link>
                </div>
            </div>

            {/* Main Content */}
            <div className="relative z-10 w-full px-6 md:px-10 lg:px-16 py-32 mx-auto max-w-6xl">
                {/* Masonry Layout */}
                <div className="columns-1 md:columns-2 xl:columns-3 gap-8 space-y-8">
                    {books.map((book, index) => {
                        const cardHeight = getCardHeight(index);
                        return (
                            <motion.div
                                key={`${book.id}-${index}`}
                                layout
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.8, delay: Math.min(index * 0.03, 1.5), ease: [0.22, 1, 0.36, 1] }}
                                className="break-inside-avoid mb-6 group relative cursor-pointer"
                                onClick={() => router.push(`/${book.month}?focus=${book.id}`)}
                            >
                                <div className="relative overflow-hidden rounded-sm shadow-[0_15px_45px_rgba(0,0,0,0.45)] hover:shadow-[0_25px_60px_rgba(0,0,0,0.6)] transition-all duration-500 bg-[#1c1915] border border-[#d4a5741a]">
                                    {/* Image */}
                                    <img
                                        src={book.originalImageUrl || book.originalThumbnailUrl || book.cardImageUrl || book.coverUrl}
                                        alt={book.title}
                                        className="w-full h-auto object-contain transition-transform duration-1000 group-hover:scale-100"
                                        loading="lazy"
                                        style={{ maxHeight: cardHeight }}
                                    />

                                    {/* 悬浮遮罩：提高題名对比度，避免亮底部干扰 */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-6 backdrop-blur-[1.5px]">
                                        <div className="bg-black/55 backdrop-blur-sm rounded-sm px-3 py-2 shadow-[0_8px_25px_rgba(0,0,0,0.45)]">
                                            <h3 className="text-[#F2F0E9] font-bold text-lg font-display tracking-wide line-clamp-2 leading-relaxed">{book.title}</h3>
                                            <p className="text-[#D4A574] text-xs mt-2 font-accent tracking-wider">{getLabel(book.month)}</p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* Shuffle Button */}
            <button
                onClick={shuffle}
                className="btn-random btn-random--dark btn-random--circle btn-random--circle-lg fixed bottom-12 right-12 shadow-[0_15px_40px_rgba(0,0,0,0.5),0_0_35px_rgba(212,165,116,0.25)] hover:scale-110 z-50 group border border-white/10"
                aria-label="Shuffle"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:rotate-180 transition-transform duration-700 ease-in-out">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                    <circle cx="8" cy="8" r="2"></circle>
                    <circle cx="16" cy="16" r="2"></circle>
                    <circle cx="8" cy="16" r="2"></circle>
                    <circle cx="16" cy="8" r="2"></circle>
                    <circle cx="12" cy="12" r="2"></circle>
                </svg>
            </button>
        </div>
    );
}
