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

    const prevIndex = (currentIndex - 1 + images.length) % images.length;
    const nextIndex = (currentIndex + 1) % images.length;

    // 计算三联流动画廊的当前槽位卡片组，保持 key 稳定以触发自然的流动位移
    const visibleCards = (() => {
        if (images.length === 0) return [];
        if (images.length === 1) {
            return [{ key: `card-${currentIndex}`, image: images[currentIndex], slot: 'current' as const, index: currentIndex }];
        }
        if (images.length === 2) {
            return [
                { key: `card-${currentIndex}`, image: images[currentIndex], slot: 'current' as const, index: currentIndex },
                { key: `card-${nextIndex}`, image: images[nextIndex], slot: 'next' as const, index: nextIndex },
            ];
        }
        return [
            { key: `card-${prevIndex}`, image: images[prevIndex], slot: 'prev' as const, index: prevIndex },
            { key: `card-${currentIndex}`, image: images[currentIndex], slot: 'current' as const, index: currentIndex },
            { key: `card-${nextIndex}`, image: images[nextIndex], slot: 'next' as const, index: nextIndex },
        ];
    })();

    return (
        <div className="relative w-full h-screen overflow-hidden flex flex-col items-center justify-center bg-gradient-to-b from-[#131315] via-[#171614] to-[#0e0e10]">

            {/* Logo - Top Left（全站统一顶部导航，首页仅显示 Logo） */}
            <TopNav showButtons={false} />

            {/* 常驻中央暖金与墨韵环境背光 - 纯 GPU 径向光场，零连续重绘开销 */}
            <div
                className="absolute inset-0 z-0 pointer-events-none select-none"
                style={{
                    background:
                        'radial-gradient(ellipse 60% 55% at 50% 50%, rgba(201, 160, 99, 0.12) 0%, rgba(30, 26, 22, 0.35) 50%, transparent 85%)',
                }}
            />

            {/* 两侧宋韵版心规矩微线与标尺 - 赋予宽屏留白空间以秩序感与呼吸感 */}
            <div className="hidden lg:flex absolute inset-y-0 left-10 z-[2] flex-col items-center justify-center pointer-events-none select-none opacity-40">
                <div className="h-32 w-[1px] bg-gradient-to-b from-transparent via-[#C9A063]/30 to-transparent" />
                <span className="my-4 writing-vertical-rl text-[9px] tracking-[0.45em] font-mono text-[#E8E6DC]/40 uppercase">
                    ISSUE · 0{currentIndex + 1}
                </span>
                <div className="h-32 w-[1px] bg-gradient-to-b from-transparent via-[#C9A063]/30 to-transparent" />
            </div>

            <div className="hidden lg:flex absolute inset-y-0 right-10 z-[2] flex-col items-center justify-center pointer-events-none select-none opacity-40">
                <div className="h-24 w-[1px] bg-gradient-to-b from-transparent via-[#C9A063]/25 to-transparent" />
                <span className="my-4 writing-vertical-rl text-[9px] tracking-[0.45em] font-mono text-[#E8E6DC]/30 uppercase">
                    ECHOES
                </span>
                <div className="h-24 w-[1px] bg-gradient-to-b from-transparent via-[#C9A063]/25 to-transparent" />
            </div>

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

            {/* Background Image Carousel（纯 GPU 硬件加速，书海画廊真·接力流体切换） */}
            <div className="absolute inset-0 z-[1] pointer-events-none select-none">
                {/* 常驻中央暖金与墨池微光 - 纯 GPU 径向光场，零连续重绘开销 */}
                <div
                    className="absolute inset-0 z-0 pointer-events-none"
                    style={{
                        background:
                            'radial-gradient(ellipse 70% 65% at 50% 50%, rgba(201, 160, 99, 0.08) 0%, rgba(18, 16, 15, 0.45) 55%, transparent 85%)',
                    }}
                />

                {/* 书海画廊三联折屏展台（Triptych Fluid Carousel Stage） */}
                <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden">
                    <div className="relative flex items-center justify-center w-full max-w-[1920px] h-full">
                        <AnimatePresence initial={false}>
                            {visibleCards.map((card) => {
                                const isCurrent = card.slot === 'current';
                                const isPrev = card.slot === 'prev';
                                const isNext = card.slot === 'next';

                                return (
                                    <motion.div
                                        key={card.key}
                                        className={`absolute h-[85vh] sm:h-[88vh] lg:h-[92vh] aspect-[760/1440] max-w-[90vw] rounded-sm overflow-hidden select-none pointer-events-none will-change-[transform,opacity] shadow-[0_25px_60px_-10px_rgba(0,0,0,0.92)] border border-[#E8E6DC]/10 ${!isCurrent ? 'hidden md:block' : 'block'}`}
                                        initial={{
                                            x: isNext ? '165%' : isPrev ? '-165%' : '60%',
                                            scale: isCurrent ? 0.95 : 0.72,
                                            opacity: 0,
                                        }}
                                        animate={{
                                            x: isCurrent ? '0%' : isPrev ? '-124%' : '124%',
                                            scale: isCurrent ? 1.15 : 0.82,
                                            opacity: isCurrent ? 1.0 : 0.38,
                                            zIndex: isCurrent ? 20 : 10,
                                        }}
                                        exit={{
                                            x: isPrev ? '-165%' : '165%',
                                            scale: 0.72,
                                            opacity: 0,
                                            zIndex: 5,
                                        }}
                                        transition={
                                            shouldReduceMotion
                                                ? { duration: 0.25, ease: 'easeOut' }
                                                : { type: 'spring', damping: 28, stiffness: 190, mass: 0.85 }
                                        }
                                    >
                                        {/* 海报原画主体图片 */}
                                        <Image
                                            src={card.image}
                                            alt={`Book Poster ${card.index + 1}`}
                                            fill
                                            className="object-contain"
                                            priority={isCurrent && currentIndex === 0}
                                            onError={handleImageError}
                                            sizes="(max-width: 1200px) 500px, 750px"
                                        />

                                        {/* 主角海报独享：宋金高光精工边线与立体暖金辉光（平滑插值淡入淡出，零跳变） */}
                                        <motion.div
                                            className="absolute inset-0 pointer-events-none rounded-sm border border-[#C9A063]/30 shadow-[inset_0_0_25px_rgba(201,160,99,0.18)]"
                                            initial={false}
                                            animate={{ opacity: isCurrent ? 1 : 0 }}
                                            transition={
                                                shouldReduceMotion
                                                    ? { duration: 0.25 }
                                                    : { type: 'spring', damping: 28, stiffness: 190, mass: 0.85 }
                                            }
                                        />

                                        {/* 左翼侧屏独享：向左渐隐暗化羽化层（平滑插值淡入淡出，彻底消灭 mask 突跳顿感） */}
                                        <motion.div
                                            className="absolute inset-0 pointer-events-none bg-gradient-to-r from-[#121214] via-[#121214]/65 to-transparent"
                                            initial={false}
                                            animate={{ opacity: isPrev ? 1 : 0 }}
                                            transition={
                                                shouldReduceMotion
                                                    ? { duration: 0.25 }
                                                    : { type: 'spring', damping: 28, stiffness: 190, mass: 0.85 }
                                            }
                                        />

                                        {/* 右翼侧屏独享：向右渐隐暗化羽化层（平滑插值淡入淡出） */}
                                        <motion.div
                                            className="absolute inset-0 pointer-events-none bg-gradient-to-l from-[#121214] via-[#121214]/65 to-transparent"
                                            initial={false}
                                            animate={{ opacity: isNext ? 1 : 0 }}
                                            transition={
                                                shouldReduceMotion
                                                    ? { duration: 0.25 }
                                                    : { type: 'spring', damping: 28, stiffness: 190, mass: 0.85 }
                                            }
                                        />
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Overlay: 电影级微暗角遮罩 - 增强文字可读性，保留中央通透与温润 */}
                <div
                    className="absolute inset-0 z-20 pointer-events-none"
                    style={{
                        background:
                            'radial-gradient(ellipse 92% 85% at 50% 50%, rgba(18, 18, 20, 0.38) 0%, rgba(14, 14, 16, 0.72) 65%, rgba(10, 10, 12, 0.94) 100%)',
                    }}
                />
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
