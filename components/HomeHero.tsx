'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import TopNav from './TopNav';
import EchoWaveDecoration from './EchoWaveDecoration';

interface HomeHeroProps {
    images: string[];
    targetLink: string;
    subtitle: string;
}

export default function HomeHero({ images, targetLink, subtitle }: HomeHeroProps) {
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

            {/* Logo - Top Left（全站统一顶部导航，首页仅显示 Logo） */}
            <TopNav showButtons={false} />

            {/* 动态同心水波纹装饰层 - 贴合“回响”意象 */}
            <EchoWaveDecoration />

            {/* Background Image Carousel */}
            <div className="absolute inset-0 z-[1] pointer-events-none">
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

            {/* Text Content - Dynamic Calligraphy Style (pointer-events-none 允许背景捕获点击水波，交互子项恢复 auto) */}
            <div
                className="relative z-[10] flex flex-col items-center justify-center pointer-events-none"
            >
                <motion.div
                    className="relative flex items-center gap-0 md:gap-2 cursor-pointer group pointer-events-auto"
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
                    className="mt-8 pointer-events-auto"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.2, duration: 0.8, ease: "easeOut" }}
                >
                    <span className="inline-block border border-[#C9A063]/40 bg-transparent px-8 py-3 text-sm font-mono tracking-[0.2em] text-[#C9A063] uppercase hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors duration-300 cursor-pointer" onClick={() => router.push(targetLink)}>
                        Enter Issue
                    </span>
                </motion.div>
            </div>
        </div>
    );
}
