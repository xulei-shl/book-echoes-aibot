'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

interface HomeHeroProps {
    images: string[];
    targetLink: string;
    title: string;
    subtitle: string;
}

// 预计算书脊线条配置（固定精度避免水合问题）
// 垂直线条配置 - 简洁的高级感线条
const VERTICAL_LINES = [...Array(13)].map((_, i) => ({
    id: i,
    left: (i * 8) + 2, // 均匀分布
    width: i % 4 === 0 ? 2 : 1, // 每4根有一根稍粗
    opacity: 0.15 + (i % 3 === 0 ? 0.15 : 0), // 透明度变化
    delay: i * 0.15
}));

// 背景线条装饰组件
function HeroLineDecoration() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return (
        <div className="absolute inset-0 z-[5] overflow-hidden pointer-events-none">
            {/* 基础暗色渐变背景 - 增强文字可读性 */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />

            {/* 垂直线条 */}
            {VERTICAL_LINES.map((line) => (
                <motion.div
                    key={line.id}
                    className="absolute top-0 bottom-0 bg-gradient-to-b from-transparent via-[#C9A063] to-transparent"
                    style={{
                        left: `${line.left}%`,
                        width: `${line.width}px`,
                        opacity: line.opacity * 0.5, // 降低整体不透明度，保持低调
                    }}
                    initial={{ scaleY: 0, opacity: 0 }}
                    animate={{ scaleY: 1, opacity: line.opacity * 0.5 }}
                    transition={{
                        duration: 1.5,
                        delay: line.delay,
                        ease: "circOut"
                    }}
                />
            ))}

            {/* 额外的水平微光线条 - 增加层次感 */}
            <motion.div
                className="absolute top-[30%] left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#C9A063]/20 to-transparent"
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ duration: 2, delay: 0.5 }}
            />
            <motion.div
                className="absolute bottom-[30%] left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#C9A063]/20 to-transparent"
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ duration: 2, delay: 0.8 }}
            />
        </div>
    );
}

export default function HomeHero({ images, targetLink, title, subtitle }: HomeHeroProps) {
    const router = useRouter();
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (images.length <= 1) return;

        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % images.length);
        }, 6000);

        return () => clearInterval(timer);
    }, [images.length]);

    const handleImageError = () => {
        console.warn(`Failed to load image at index ${currentIndex}`);
    };

    return (
        <div className="relative w-full h-screen overflow-hidden flex flex-col items-center justify-center bg-[#1a1a1a]">

            {/* 抽象线条装饰层 - 最底层 */}
            <HeroLineDecoration />

            {/* Background Image Carousel */}
            <div className="absolute inset-0 z-[1]">
                <AnimatePresence mode="wait">
                    {images.length > 0 && (
                        <motion.div
                            key={currentIndex}
                            className="absolute inset-0"
                            initial={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
                            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, scale: 1.05, filter: 'blur(5px)' }}
                            transition={{ duration: 2, ease: "easeInOut" }}
                        >
                            {/* 背景模糊层 - 填充屏幕，营造氛围 */}
                            <div className="absolute inset-0 z-0">
                                <Image
                                    src={images[currentIndex]}
                                    alt="Background Blur"
                                    fill
                                    className="object-cover blur-3xl scale-110 opacity-40"
                                />
                            </div>

                            {/* 主体图片层 - 完整展示，不被裁切 */}
                            <Image
                                src={images[currentIndex]}
                                alt={`Hero Image ${currentIndex + 1}`}
                                fill
                                className="object-contain z-10 relative"
                                priority={currentIndex === 0}
                                onError={handleImageError}
                            />

                            {/* Overlay: 电影级渐变遮罩 - 加深以增强对比 */}
                            <div className="absolute inset-0 z-20 bg-gradient-to-b from-black/70 via-black/40 to-black/90 pointer-events-none" />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Text Content - Dynamic Calligraphy Style */}
            <div
                className="relative z-[10] flex flex-col items-center justify-center"
            >
                <motion.div
                    className="relative flex items-center gap-0 md:gap-2 cursor-pointer group"
                    onClick={() => router.push(targetLink)}
                    initial={{ opacity: 0, scale: 0.9, y: 30 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                >
                    {/* Main Title with Dynamic Sizing */}
                    <div className="flex items-end -space-x-2 md:-space-x-4 select-none"
                        style={{
                            fontFamily: 'var(--font-hero-title)',
                            color: '#E8E6DC', // Warmer Antique White for less glare
                            textShadow: '0 4px 20px rgba(0,0,0,0.6)', // Deeper shadow
                        }}
                    >
                        {/* 书 - Big */}
                        <motion.span
                            className="text-8xl md:text-[11rem] lg:text-[12rem] leading-none"
                            whileHover={{ scale: 1.05, rotate: -2 }}
                            transition={{ type: "spring", stiffness: 300 }}
                        >
                            書
                        </motion.span>

                        {/* 海 - Small, slightly raised */}
                        <motion.span
                            className="text-5xl md:text-[6rem] lg:text-[rem] leading-none mb-4 md:mb-8 opacity-90"
                            whileHover={{ scale: 1.1, y: -10 }}
                            transition={{ type: "spring", stiffness: 300 }}
                        >
                            海
                        </motion.span>

                        {/* 回 - Medium, standard baseline */}
                        <motion.span
                            className="text-6xl md:text-[7rem] lg:text-[9rem] leading-none opacity-95"
                            whileHover={{ scale: 1.1, rotate: 2 }}
                            transition={{ type: "spring", stiffness: 300 }}
                        >
                            回
                        </motion.span>

                        {/* 响 - Big, slightly lower */}
                        <motion.span
                            className="text-8xl md:text-[11rem] lg:text-[14rem] leading-none -mb-2 md:-mb-4"
                            whileHover={{ scale: 1.05, x: 5 }}
                            transition={{ type: "spring", stiffness: 300 }}
                        >
                            響
                        </motion.span>
                    </div>

                    {/* Vertical Decorative Text */}
                    <div className="h-[120px] md:h-[200px] w-[1px] bg-[#E8E6DC]/30 mx-1 md:mx-2" />

                    <div className="flex flex-col justify-center h-full gap-2 opacity-80">
                        <span className="writing-vertical-rl text-[10px] md:text-xs tracking-[0.4em] font-serif text-[#E8E6DC]/80">
                            SHU
                        </span>
                        <span className="writing-vertical-rl text-[10px] md:text-xs tracking-[0.4em] font-serif text-[#E8E6DC]/80">
                            HAI
                        </span>
                        <span className="writing-vertical-rl text-[10px] md:text-xs tracking-[0.4em] font-serif text-[#E8E6DC]/80">
                            HUI
                        </span>
                        <span className="writing-vertical-rl text-[10px] md:text-xs tracking-[0.4em] font-serif text-[#E8E6DC]/80">
                            XIANG
                        </span>
                    </div>
                </motion.div>

                <motion.p
                    className="mt-8 font-body text-xl md:text-2xl tracking-[0.3em] text-[#E8E6DC] drop-shadow-md opacity-90"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8, duration: 0.8 }}
                >
                    {subtitle}
                </motion.p>

                <motion.div
                    className="mt-8"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.2, duration: 0.8, ease: "easeOut" }}
                >
                    <span className="border border-[#E8E6DC]/50 bg-black/30 backdrop-blur-sm px-8 py-3 rounded-full text-sm tracking-[0.2em] text-[#E8E6DC] uppercase hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-all duration-300 shadow-lg cursor-pointer" onClick={() => router.push(targetLink)}>
                        Enter Issue
                    </span>
                </motion.div>
            </div>
        </div>
    );
}
