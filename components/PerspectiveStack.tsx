'use client';

import React from 'react';
import Image from 'next/image';
import { motion, type Variants } from 'framer-motion';

interface PerspectiveStackProps {
    images: string[];
    title: string;
    maxCards?: number;
    className?: string;
}

/**
 * 3D 竖版图书封面透视堆叠画廊 (Perspective Book Stack)
 * 特性:
 * 1. 竖版精装书开本比例 (aspect-[2/3])，完美呈现图书封面艺术
 * 2. 中心对消校准 (Center Offset Compensation)，确保视觉重心稳定居中，不向右上漂移
 * 3. 真实精装书细节 (书脊压槽、装帧暗线、纸质漫反射微光)
 * 4. 可中断的优雅 Hover 扇形微展开，符合 better-ui cubic-bezier(0.2, 0, 0, 1) 规范
 */
export default function PerspectiveStack({
    images = [],
    title,
    maxCards = 5,
    className = ''
}: PerspectiveStackProps) {
    // 过滤有效图片并截取最多 maxCards 本
    const displayImages = images.filter(Boolean).slice(0, maxCards);
    const count = displayImages.length;

    // 空态兜底
    if (count === 0) {
        return (
            <div className={`relative w-full h-full flex items-center justify-center ${className}`}>
                <div className="text-center text-[#C9A063]/40">
                    <p className="font-display text-sm tracking-wider">等待书籍归档</p>
                </div>
            </div>
        );
    }

    // 单本图书兜底：正面居中展示优雅精装书
    if (count === 1) {
        return (
            <div className={`relative w-full h-full flex items-center justify-center ${className}`}>
                <div className="relative h-[82%] aspect-[2/3] rounded-[2px] overflow-hidden outline outline-1 outline-white/15 shadow-[0_16px_36px_rgba(0,0,0,0.6)]">
                    <Image
                        src={displayImages[0]}
                        alt={title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 50vw, 200px"
                    />
                    {/* 书脊压槽质感 */}
                    <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/35 via-transparent to-white/5 pointer-events-none" />
                    <div className="absolute inset-y-0 left-3 w-[1px] bg-black/20 pointer-events-none" />
                    {/* 封面漫反射光 */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-black/20 via-transparent to-white/10 pointer-events-none" />
                </div>
            </div>
        );
    }

    // 几何度量参数 (单步偏移量)
    const stepX = 14; // 默认每本向右偏移
    const stepY = 10; // 默认每本向上偏移
    const hoverStepX = 20; // Hover 展开时每本向右偏移
    const hoverStepY = 13; // Hover 展开时每本向上偏移

    // 中心校准偏移量: 将整排书的总跨度对半折算，让书堆的视觉中点精准落于舞台中心
    const baseOffsetX = -((count - 1) * stepX) / 2;
    const baseOffsetY = ((count - 1) * stepY) / 2;
    const hoverOffsetX = -((count - 1) * hoverStepX) / 2;
    const hoverOffsetY = ((count - 1) * hoverStepY) / 2;

    // Framer Motion 变体动画
    const bookVariants: Variants = {
        initial: (index: number) => {
            const posX = baseOffsetX + index * stepX;
            const posY = baseOffsetY - index * stepY;
            const scale = 1 - index * 0.028;
            const brightness = Math.max(0.72, 1 - index * 0.065);

            return {
                x: posX,
                y: posY,
                z: -index * 18,
                rotateY: -14,
                rotateX: 7,
                rotateZ: 1.5,
                scale,
                filter: `brightness(${brightness})`,
                transition: {
                    duration: 0.35,
                    ease: [0.2, 0, 0, 1]
                }
            };
        },
        hover: (index: number) => {
            const isHero = index === 0;
            const posX = hoverOffsetX + index * hoverStepX;
            // Hero 封面在 hover 时单独微浮 4px
            const posY = hoverOffsetY - index * hoverStepY - (isHero ? 4 : 0);
            const scale = isHero ? 1.03 : 1 - index * 0.02;
            const brightness = Math.max(0.78, 1 - index * 0.045);

            return {
                x: posX,
                y: posY,
                z: -index * 18,
                rotateY: -11,
                rotateX: 5,
                rotateZ: 1,
                scale,
                filter: `brightness(${brightness})`,
                transition: {
                    duration: 0.35,
                    ease: [0.2, 0, 0, 1]
                }
            };
        }
    };

    return (
        <div
            className={`relative w-full h-full flex items-center justify-center select-none ${className}`}
            style={{ perspective: 1100 }}
        >
            {/* 3D 舞台容器 (书籍开本比例 aspect-[2/3]) */}
            <div
                className="relative h-[78%] aspect-[2/3] transform-gpu"
                style={{
                    transformStyle: 'preserve-3d',
                }}
            >
                {displayImages.map((src, index) => {
                    const isHero = index === 0;
                    const zIndex = count - index;

                    return (
                        <motion.div
                            key={src + index}
                            custom={index}
                            variants={bookVariants}
                            style={{
                                zIndex,
                                transformStyle: 'preserve-3d',
                            }}
                            className={`absolute inset-0 rounded-[2px] overflow-hidden motion-reduce:transform-none pointer-events-none ${
                                isHero
                                    ? 'outline outline-1 outline-white/20 shadow-[0_16px_34px_rgba(0,0,0,0.7),-5px_6px_14px_rgba(0,0,0,0.45)]'
                                    : 'outline outline-1 outline-white/10 shadow-[-5px_6px_16px_rgba(0,0,0,0.55)]'
                            }`}
                        >
                            {/* 图书原版竖向封面 */}
                            <Image
                                src={src}
                                alt={isHero ? title : `${title} 封面 ${index + 1}`}
                                fill
                                className="object-cover"
                                sizes="(max-width: 768px) 50vw, 220px"
                                priority={isHero}
                            />

                            {/* 精装书脊立体压槽与阴影 */}
                            <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/40 via-black/10 to-transparent pointer-events-none" />
                            <div className="absolute inset-y-0 left-2.5 w-[1px] bg-black/25 pointer-events-none" />

                            {/* 封面印刷哑光质感与漫反射微光 */}
                            <div className="absolute inset-0 bg-gradient-to-tr from-black/20 via-transparent to-white/12 pointer-events-none" />

                            {/* 后排书籍侧边缘与切口压暗线 */}
                            {!isHero && (
                                <div className="absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-black/60 to-transparent pointer-events-none" />
                            )}
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
