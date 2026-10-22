'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import TopNav from './TopNav';
import Orb from './Orb';

interface HomeHeroProps {
    images: string[];
    targetLink: string;
    subtitle: string;
}

// 订阅媒体查询：精准识别指针设备是否支持 hover，隔离触摸设备以防 sticky hover 粘滞
function subscribeHover(callback: () => void) {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    mq.addEventListener('change', callback);
    return () => mq.removeEventListener('change', callback);
}

function getHoverSnapshot() {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

function getServerHoverSnapshot() {
    return false;
}

// 响应式订阅 Orb 光环大小：舒展包容“書海回響”书法及右侧纵向拼音，确保文字完全不被光环遮挡
function subscribeResize(callback: () => void) {
    window.addEventListener('resize', callback, { passive: true });
    return () => window.removeEventListener('resize', callback);
}

function getOrbSizeSnapshot() {
    if (window.innerWidth < 768) return 1.15;
    if (window.innerWidth < 1280) return 1.08;
    return 1.03;
}

function getServerOrbSizeSnapshot() {
    return 1.03;
}

export default function HomeHero({ images, targetLink, subtitle }: HomeHeroProps) {
    const router = useRouter();
    const [currentIndex, setCurrentIndex] = useState(0);
    const orbSize = useSyncExternalStore(subscribeResize, getOrbSizeSnapshot, getServerOrbSizeSnapshot);
    const canHover = useSyncExternalStore(subscribeHover, getHoverSnapshot, getServerHoverSnapshot);
    const shouldReduceMotion = useReducedMotion();

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

    // 统一的书法单字物理弹簧配置（增加阻尼，杜绝失控晃动）
    const glyphSpring = { type: 'spring', stiffness: 300, damping: 20 } as const;
    const isInteractiveHover = !shouldReduceMotion && canHover;

    return (
        <div className="relative w-full h-screen overflow-hidden flex flex-col items-center justify-center bg-[#1a1a1a]">

            {/* Logo - Top Left（全站统一顶部导航，首页仅显示 Logo） */}
            <TopNav showButtons={false} />

            {/* 动态天象光环动效 - 皓月纯白与雅致宋金交融，呼应“书海回响”意象 */}
            <div className="absolute inset-0 z-[5] pointer-events-auto">
                <Orb
                    colors={['#FFFFFF', '#C9A063', '#141210']}
                    size={orbSize}
                    glow={1.25}
                    bleed={0.52}
                    wobble={0.25}
                    highlight={1.4}
                    trail={1.4}
                    tiltX={-3}
                    tiltY={-4}
                    speed={0.65}
                    hoverIntensity={0.8}
                    rotateOnHover
                    followCursor
                    clickPulse
                />
            </div>

            {/* Background Image Carousel（纯 GPU 透明度平滑 Crossfade，无黑屏断层，无昂贵全屏动态滤镜） */}
            <div className="absolute inset-0 z-[1] pointer-events-none">
                <AnimatePresence initial={false}>
                    {images.length > 0 && (
                        <motion.div
                            key={currentIndex}
                            className="absolute inset-0"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 1.0, ease: 'easeInOut' }}
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
            <div className="relative z-[10] flex flex-col items-center justify-center pointer-events-none">
                <motion.div
                    className="relative flex items-center gap-0 md:gap-2 cursor-pointer group pointer-events-auto select-none"
                    onClick={() => router.push(targetLink)}
                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
                >
                    {/* Main Title with Dynamic Sizing */}
                    <div
                        className="flex items-end -space-x-2 md:-space-x-4 select-none"
                        style={{
                            fontFamily: 'var(--font-hero-title)',
                            color: '#E8E6DC', // Warmer Antique White for less glare
                            textShadow: '0 4px 20px rgba(0,0,0,0.6)', // Deeper shadow
                        }}
                    >
                        {/* 书 - Big */}
                        <motion.span
                            className="inline-block text-8xl md:text-[11rem] lg:text-[12rem] leading-none"
                            whileHover={isInteractiveHover ? { scale: 1.05, rotate: -2 } : undefined}
                            transition={glyphSpring}
                        >
                            書
                        </motion.span>

                        {/* 海 - Small, slightly raised */}
                        <motion.span
                            className="inline-block text-5xl md:text-[6rem] lg:text-[8rem] leading-none mb-4 md:mb-8 opacity-90"
                            whileHover={isInteractiveHover ? { scale: 1.08, y: -8 } : undefined}
                            transition={glyphSpring}
                        >
                            海
                        </motion.span>

                        {/* 回 - Medium, standard baseline */}
                        <motion.span
                            className="inline-block text-6xl md:text-[7rem] lg:text-[9rem] leading-none opacity-95"
                            whileHover={isInteractiveHover ? { scale: 1.08, rotate: 2 } : undefined}
                            transition={glyphSpring}
                        >
                            回
                        </motion.span>

                        {/* 响 - Big, slightly lower */}
                        <motion.span
                            className="inline-block text-8xl md:text-[11rem] lg:text-[14rem] leading-none -mb-2 md:-mb-4"
                            whileHover={isInteractiveHover ? { scale: 1.05, x: 4 } : undefined}
                            transition={glyphSpring}
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

                {/* Subtitle - 紧随标题轻柔浮现，平衡折行 */}
                <motion.p
                    className="mt-8 font-body text-xl md:text-2xl tracking-[0.3em] text-[#E8E6DC] drop-shadow-md opacity-90 text-center"
                    style={{ textWrap: 'balance' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15, duration: 0.4, ease: 'easeOut' }}
                >
                    {subtitle}
                </motion.p>

                {/* CTA 按钮 - 语义化 button、快速出场、Scale on Press 触感反馈 */}
                <motion.div
                    className="mt-8 pointer-events-auto"
                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25, duration: 0.4, ease: 'easeOut' }}
                >
                    <button
                        type="button"
                        onClick={() => router.push(targetLink)}
                        className="inline-block border border-[#C9A063]/40 bg-transparent px-8 py-3 text-sm font-mono tracking-[0.2em] text-[#C9A063] uppercase transition-[background-color,color,transform] duration-150 ease-out hover:bg-[#C9A063] hover:text-[#1a1a1a] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A063] cursor-pointer"
                    >
                        Enter Issue
                    </button>
                </motion.div>
            </div>
        </div>
    );
}
