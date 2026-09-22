'use client';

import { useState, useEffect, useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import TopNav from './TopNav';

interface RandomMasonryProps {
    initialBooks: RandomBook[];
    initialCursor?: string;
    seed: number;
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

interface RandomBook {
    id: string;
    title: string;
    sourceId: string;
    month: string;
    thumbnailUrl: string;
    imageUrl: string;
    displayUrl?: string;
    placeholderUrl?: string;
    width?: number;
    height?: number;
}

interface GridMetrics {
    /** 单列宽度（px），由实际渲染的 grid 列宽测得 */
    colWidth: number;
}

/**
 * 固定的线条配置 - 使用质数分布模拟随机感，避免每次重新计算
 *
 * 线条层固定为视口尺寸（见下方背景层），因此这里只保留单屏所需的条数。
 */
const FIXED_LINES: LineParticle[] = [...Array(20)].map((_, i) => ({
    id: i,
    orientation: (i % 2 === 0 ? 'h' : 'v') as 'h' | 'v',
    x: (i * 13.7) % 100,  // 使用质数13.7实现伪随机分布
    y: (i * 17.3) % 100,  // 使用质数17.3实现伪随机分布
    length: ((i * 23) % 200 + 100) + 'px',  // 长度范围: 100-300px
    duration: (i % 10) + 15,  // 动画时长: 15-24秒
    delay: (i % 20) * 0.5  // 延迟: 0-9.5秒
}));

/** 尺寸缺失时的兜底比例（多数原图为横版） */
const DEFAULT_ASPECT = 3 / 2;
/** 行间距（= Tailwind gap-8） */
const ROW_GAP = 32;

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * 测量真实的 grid 列宽与列数。
 *
 * 随机页展示原图（横竖版、尺寸不一），需要按各自比例保留高度。
 * 用「1px 行高 + span」的网格瀑布流：条目高度 = 列宽 / 比例，
 * span = 高度 + 行间距。位置只取决于列宽与序号，追加新批次时已有卡片不会移动，
 * 也就不会重演多列瀑布流动辄整列位移的跳动。
 */
function useGridMetrics(ref: RefObject<HTMLDivElement | null>, deps: unknown[]) {
    const [metrics, setMetrics] = useState<GridMetrics | null>(null);

    useIsomorphicLayoutEffect(() => {
        const el = ref.current;
        if (!el) {
            return;
        }
        const measure = () => {
            const styles = getComputedStyle(el);
            const columns = styles.gridTemplateColumns.split(' ').filter(Boolean);
            const colWidth = columns.length ? parseFloat(columns[0]) : 0;
            if (colWidth > 0) {
                setMetrics(prev => (prev && prev.colWidth === colWidth ? prev : { colWidth }));
            }
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, deps);

    return metrics;
}

interface RandomBookCardProps {
    book: RandomBook;
    index: number;
    shouldAnimate: boolean;
    animationStartIndex: number;
    label: string;
    metrics: GridMetrics | null;
    onOpen: (book: RandomBook) => void;
}

/** 单张卡片：加载态收敛在卡片内部，避免某张图 onLoad 时重渲染整个列表 */
function RandomBookCard({ book, index, shouldAnimate, animationStartIndex, label, metrics, onOpen }: RandomBookCardProps) {
    const [coverLoaded, setCoverLoaded] = useState(false);

    // 优先原图的 WebP 显示版；未重编码时用等比占位图，最后才退到原图
    const coverSrc = book.displayUrl || book.placeholderUrl || book.imageUrl;
    const placeholderSrc = book.placeholderUrl && book.placeholderUrl !== coverSrc ? book.placeholderUrl : '';

    const aspect = book.width && book.height ? book.width / book.height : DEFAULT_ASPECT;
    const itemHeight = metrics ? metrics.colWidth / aspect : undefined;
    const rowSpan = itemHeight ? Math.max(1, Math.round(itemHeight) + ROW_GAP) : undefined;

    // 图片在 SSR HTML 里就已开始下载，可能早于 React 挂载完成。
    // 这种情况下 onLoad 不会再触发，必须用 ref 回调补一次 complete 检查，
    // 否则已经加载好的卡片会永远停留在透明状态。
    const attachCover = useCallback((node: HTMLImageElement | null) => {
        if (node?.complete) {
            setCoverLoaded(true);
        }
    }, []);

    return (
        <motion.div
            initial={shouldAnimate ? { opacity: 0, y: 30 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{
                duration: shouldAnimate ? 0.8 : 0,
                delay: shouldAnimate ? Math.min((index - animationStartIndex) * 0.03, 1.2) : 0,
                ease: [0.22, 1, 0.36, 1]
            }}
            className="group relative cursor-pointer"
            style={{
                gridRowEnd: rowSpan ? `span ${rowSpan}` : undefined,
                height: itemHeight ? `${itemHeight}px` : undefined,
                aspectRatio: itemHeight ? undefined : String(aspect)
            }}
            onClick={() => onOpen(book)}
        >
            <div className="relative h-full w-full overflow-hidden rounded-sm shadow-[0_15px_45px_rgba(0,0,0,0.45)] hover:shadow-[0_25px_60px_rgba(0,0,0,0.6)] transition-shadow duration-500 bg-[#1c1915] border border-[#d4a5741a]">
                {/* 等比占位/兜底层：原图缩略图模糊铺底，主图到达后淡出 */}
                {placeholderSrc && (
                    <div
                        aria-hidden
                        className={`absolute inset-0 bg-cover bg-center transition-opacity duration-700 ${coverLoaded ? 'opacity-0' : 'opacity-100'}`}
                        style={{ backgroundImage: `url(${placeholderSrc})`, filter: 'blur(14px)', transform: 'scale(1.08)' }}
                    />
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    ref={attachCover}
                    src={coverSrc}
                    alt={book.title}
                    loading={index < 6 ? 'eager' : 'lazy'}
                    decoding="async"
                    draggable={false}
                    onLoad={() => setCoverLoaded(true)}
                    onError={() => setCoverLoaded(true)}
                    className={`relative h-full w-full object-cover transition-opacity duration-500 ${coverLoaded ? 'opacity-100' : 'opacity-0'}`}
                />

                {/* 悬浮遮罩：提高題名对比度，避免亮底部干扰 */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-6 backdrop-blur-[1.5px]">
                    <div className="bg-black/55 backdrop-blur-sm rounded-sm px-3 py-2 shadow-[0_8px_25px_rgba(0,0,0,0.45)]">
                        <h3 className="text-[#F2F0E9] font-bold text-lg font-display tracking-wide line-clamp-2 leading-relaxed">{book.title}</h3>
                        <p className="text-[#D4A574] text-xs mt-2 font-accent tracking-wider">{label}</p>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

export default function RandomMasonry({ initialBooks, initialCursor, seed }: RandomMasonryProps) {
    const [books, setBooks] = useState(initialBooks);
    const [nextCursor, setNextCursor] = useState<string | undefined>(initialCursor);
    const [currentSeed, setCurrentSeed] = useState(seed);
    const [isLoading, setIsLoading] = useState(false);
    const [animationStartIndex, setAnimationStartIndex] = useState(0);
    const router = useRouter();
    const loadMoreRef = useRef<HTMLDivElement | null>(null);
    const gridRef = useRef<HTMLDivElement | null>(null);
    const metrics = useGridMetrics(gridRef, [books.length]);

    useEffect(() => {
        // 只需要随机排序书籍，线条使用固定配置
        setBooks([...initialBooks].sort(() => Math.random() - 0.5));
        setNextCursor(initialCursor);
        setCurrentSeed(seed);
        setAnimationStartIndex(0);
    }, [initialBooks, initialCursor, seed]);

    const shuffle = () => {
        setBooks(prev => [...prev].sort(() => Math.random() - 0.5));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleOpen = useCallback((book: RandomBook) => {
        router.push(`/${book.month}?focus=${book.id}`);
    }, [router]);

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

    const loadMore = useCallback(async () => {
        if (!nextCursor || isLoading) {
            return;
        }
        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                limit: '18',
                cursor: nextCursor,
                seed: String(currentSeed)
            });
            const response = await fetch(`/api/random?${params.toString()}`);
            if (!response.ok) {
                throw new Error('加载失败');
            }
            const data = await response.json();
            const newItems: RandomBook[] = Array.isArray(data?.items) ? data.items : [];
            setBooks(prev => {
                setAnimationStartIndex(prev.length);
                return [...prev, ...newItems];
            });
            setNextCursor(data?.nextCursor || undefined);
            if (Number.isFinite(data?.seed)) {
                setCurrentSeed(Number(data.seed));
            }
        } catch (error) {
            console.error('随机漫步加载失败:', error);
        } finally {
            setIsLoading(false);
        }
    }, [nextCursor, isLoading, currentSeed]);

    useEffect(() => {
        if (!loadMoreRef.current || !nextCursor) {
            return;
        }
        const observer = new IntersectionObserver((entries) => {
            if (entries.some(entry => entry.isIntersecting)) {
                loadMore();
            }
        }, { rootMargin: '200px' });
        observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [nextCursor, loadMore]);

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

                {/* 漂浮线条 - 模拟解构的网格。
                    必须用 fixed：线条用 top: X% 定位，若容器随页面内容增高，
                    每加载一批就会出现一次整组下移。fixed 让百分比对齐稳定的视口。 */}
                <div className="fixed inset-0">
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

            {/* Header Navigation（全站统一顶部导航） */}
            <TopNav theme="dark" />

            {/* Main Content */}
            <div className="relative z-10 w-full px-6 md:px-10 lg:px-16 py-32 mx-auto max-w-6xl">
                {/* 变高瀑布流：条目按原图比例保留高度，测量列宽后用 1px 行高 + span 排布。
                    未测量前退化为普通 grid（卡片用 aspect-ratio 撑开），SSR 无 JS 也可读。 */}
                <div
                    ref={gridRef}
                    className="random-masonry-grid grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3"
                    style={{
                        gridAutoRows: metrics ? '1px' : undefined,
                        rowGap: metrics ? 0 : undefined
                    }}
                >
                    {books.map((book, index) => (
                        <RandomBookCard
                            key={`${book.id}-${index}`}
                            book={book}
                            index={index}
                            shouldAnimate={index >= animationStartIndex}
                            animationStartIndex={animationStartIndex}
                            label={getLabel(book.month)}
                            metrics={metrics}
                            onOpen={handleOpen}
                        />
                    ))}
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

            <div ref={loadMoreRef} className="h-1 w-full" />
        </div>
    );
}
