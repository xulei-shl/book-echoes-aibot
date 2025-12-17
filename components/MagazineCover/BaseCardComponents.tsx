import { motion } from 'framer-motion';
import Image from 'next/image';

interface Month {
    id: string;
    label: string;
    vol: string;
    previewCards: string[];
    bookCount: number;
}

interface BaseCardLayoutProps {
    month: Month;
    isHovered: boolean;
    isLatest: boolean;
    isCenter?: boolean;
    children?: React.ReactNode;
}

/**
 * 基础卡片布局组件 - 提供纸质纹理背景、装饰色块、渐变遮罩等共同元素
 */
export function BaseCardLayout({
    month,
    isHovered,
    isLatest,
    isCenter = false,
    children
}: BaseCardLayoutProps) {
    return (
        <>
            {/* 纸质纹理背景 */}
            <div className="absolute inset-0 opacity-15">
                <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                    <filter id={`paper-texture-${month.id}`}>
                        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" result="noise" />
                        <feDiffuseLighting in="noise" lightingColor="#8B7355" surfaceScale="1">
                            <feDistantLight azimuth="45" elevation="60" />
                        </feDiffuseLighting>
                    </filter>
                    <rect width="100%" height="100%" filter={`url(#paper-texture-${month.id})`} opacity="0.15" />
                </svg>
            </div>

            {/* 装饰性色块 */}
            <div className="absolute inset-0 opacity-5">
                <div className={`absolute top-0 right-0 ${isCenter ? 'w-48 h-48' : 'w-32 h-32'} rounded-full blur-3xl`}
                    style={{ backgroundColor: '#8B3A3A' }} />
                <div className={`absolute bottom-0 left-0 ${isCenter ? 'w-32 h-32' : 'w-24 h-24'} rounded-full blur-3xl`}
                    style={{ backgroundColor: '#A67C52' }} />
            </div>

            {/* 子组件内容 */}
            {children}

            {/* 渐变遮罩 */}
            <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'linear-gradient(to top, rgba(44, 44, 44, 0.88) 0%, rgba(44, 44, 44, 0.42) 45%, transparent 85%)' }} />

            {/* 光效 - 轻微提升hover时的亮度 */}
            {isHovered && (
                <motion.div
                    className="absolute inset-0 pointer-events-none"
                    style={{ backgroundColor: 'rgba(242, 240, 233, 0.05)' }}
                    animate={{ opacity: isHovered ? 1 : 0 }}
                />
            )}
        </>
    );
}

interface CardInfoProps {
    month: Month;
    isLatest: boolean;
    isCenter?: boolean;
}

/**
 * 卡片信息层组件 - 显示月份、期数、书籍数量等信息
 */
export function CardInfo({ month, isLatest, isCenter = false }: CardInfoProps) {
    return (
        <div className={`absolute inset-0 flex flex-col justify-end ${isCenter ? 'px-4 pt-3 pb-8 md:px-5 md:pb-9' : 'px-3 pt-2 pb-7 md:px-4 md:pb-8'} pointer-events-none`}
            style={{ color: '#F2F0E9', zIndex: 15 }}>
            {isLatest && (
                <motion.span
                    className="inline-flex items-center gap-1 mb-1.5 w-fit px-1.5 py-0.5 backdrop-blur-sm rounded-full text-[10px] font-medium border"
                    style={{
                        backgroundColor: 'rgba(139, 58, 58, 0.3)',
                        borderColor: 'rgba(139, 58, 58, 0.5)'
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                >
                    最新期
                </motion.span>
            )}
            <motion.h2
                className={`font-display ${isCenter ? 'text-2xl md:text-3xl' : 'text-lg md:text-xl'} mb-1.5`}
                style={{
                    textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
                    color: '#F2F0E9'
                }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
            >
                {month.label}
            </motion.h2>
            <motion.p
                className={`font-body ${isCenter ? 'text-base md:text-lg' : 'text-sm md:text-base'} mb-0.5`}
                style={{ color: 'rgba(242, 240, 233, 0.9)' }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
            >
                {month.vol}
            </motion.p>
            {month.bookCount > 0 && (
                <motion.p
                    className={`font-body ${isCenter ? 'text-xs' : 'text-[10px]'}`}
                    style={{ color: 'rgba(242, 240, 233, 0.8)' }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                >
                    收录 {month.bookCount} 本书
                </motion.p>
            )}
        </div>
    );
}

interface BookCollageProps {
    previewCards: string[];
    isHovered: boolean;
    isCenter?: boolean;
}

/**
 * 书籍拼贴组件 - 显示多张书籍封面的拼贴效果
 */
export function BookCollage({ previewCards, isHovered, isCenter = false }: BookCollageProps) {
    if (previewCards.length === 0) {
        return (
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center" style={{ color: '#8B3A3A' }}>
                    <svg className={`${isCenter ? 'w-16 h-16' : 'w-12 h-12'} mx-auto mb-2 opacity-30`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <p className={`font-display ${isCenter ? 'text-xs' : 'text-[10px]'} opacity-40`}>等待书籍归档</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`absolute inset-0 flex items-center justify-center ${isCenter ? 'px-6 pt-8 pb-14' : 'px-5 pt-7 pb-12'}`}>
            {/* 背景书籍层 */}
            {previewCards.length >= 3 && (
                <div className={`absolute ${isCenter ? 'w-2/5' : 'w-1/3'} aspect-[2/3] rounded-md shadow-md`}
                    style={{
                        transform: isCenter ? 'translate(20%, -15%) rotateZ(10deg)' : 'translate(18%, -12%) rotateZ(8deg)',
                        zIndex: 1,
                        opacity: 0.55
                    }}>
                    <Image
                        src={previewCards[2]}
                        alt="Book 3"
                        fill
                        className="object-cover rounded-md"
                        sizes={isCenter ? '120px' : '80px'}
                    />
                </div>
            )}

            {previewCards.length >= 2 && (
                <div className={`absolute ${isCenter ? 'w-2/5' : 'w-1/3'} aspect-[2/3] rounded-md shadow-lg`}
                    style={{
                        transform: isCenter ? 'translate(-22%, -10%) rotateZ(-7deg)' : 'translate(-18%, -8%) rotateZ(-5deg)',
                        zIndex: 2,
                        opacity: 0.7
                    }}>
                    <Image
                        src={previewCards[1]}
                        alt="Book 2"
                        fill
                        className="object-cover rounded-md"
                        sizes={isCenter ? '120px' : '80px'}
                    />
                </div>
            )}

            {/* 主封面 */}
            <motion.div
                className={`relative ${isCenter ? 'w-3/5' : 'w-1/2'} aspect-[2/3] rounded-md shadow-2xl`}
                animate={{
                    scale: isHovered ? 1.05 : 1,
                    rotateZ: isHovered ? 0 : -2
                }}
                style={{ zIndex: 10 }}
            >
                <Image
                    src={previewCards[0]}
                    alt="Main cover"
                    fill
                    className="object-cover rounded-md"
                    sizes="(max-width: 768px) 50vw, 320px"
                />
                <div className="absolute inset-0 rounded-md border-2 border-white/10" />
            </motion.div>
        </div>
    );
}
