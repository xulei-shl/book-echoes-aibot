'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Book } from '@/types';

export interface BookDetailPanelProps {
    book: Book;
    onClose: () => void;
    /** 上一条（画板书籍 / 检索结果，循环切换）。与 onNext 同时提供时才显示导航按钮 */
    onPrev?: () => void;
    /** 下一条 */
    onNext?: () => void;
    /** 右上角菜单抽屉内容（画板传入下载/全部下载）。不传则渲染直接关闭按钮 */
    menu?: ReactNode;
    /** 评分行右侧的入口专属信息（检索：语义相关度徽标） */
    meta?: ReactNode;
    /** 资源链接行（馆藏/豆瓣旁）的入口专属操作（检索：前往画布） */
    actions?: ReactNode;
}

/**
 * 图书详情面板（公共组件）
 *
 * 只负责「右侧详情面板」这一层的展示与上一条/下一条/关闭交互，
 * 左侧封面由各页面自行渲染（画板用 FocusedCard，检索页用大封面）。
 * 数据导航与关闭通过 props 注入，面板本身不依赖任何页面级状态。
 */
export default function BookDetailPanel({
    book,
    onClose,
    onPrev,
    onNext,
    menu,
    meta,
    actions
}: BookDetailPanelProps) {
    // 用 ref 持有最新的 onClose，避免每次渲染都重挂键盘/滚动锁定副作用
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onCloseRef.current();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, []);

    const hasNavigation = Boolean(onPrev && onNext);

    return (
        <>
            {/* Navigation Buttons - Outside panel */}
            {hasNavigation && (
                <>
                    <button
                        type="button"
                        aria-label="上一条"
                        className="flex items-center justify-center font-mono w-12 h-12 border border-[#C9A063]/30 bg-[#1a1a1a]/95 backdrop-blur text-[#C9A063]/80 hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors duration-300 fixed left-[calc(40%+2rem)] top-1/2 -translate-y-1/2 z-[121] text-2xl shadow-[0_10px_30px_rgba(0,0,0,0.3)]"
                        onClick={onPrev}
                    >
                        &larr;
                    </button>
                    <button
                        type="button"
                        aria-label="下一条"
                        className="flex items-center justify-center font-mono w-12 h-12 border border-[#C9A063]/30 bg-[#1a1a1a]/95 backdrop-blur text-[#C9A063]/80 hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors duration-300 fixed right-8 top-1/2 -translate-y-1/2 z-[121] text-2xl shadow-[0_10px_30px_rgba(0,0,0,0.3)]"
                        onClick={onNext}
                    >
                        &rarr;
                    </button>
                </>
            )}

            {/* Top-right controls: 画板为三点的菜单抽屉，其余入口为直接关闭按钮 */}
            {menu ? (
                <div className="fixed top-8 right-8 z-[121] group">
                    <button
                        aria-label="菜单"
                        className="flex items-center justify-center w-10 h-10 border border-[#C9A063]/30 bg-[#1a1a1a]/95 backdrop-blur text-[#C9A063]/80 shadow-[0_10px_30px_rgba(0,0,0,0.3)] hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors duration-300"
                    >
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="5" r="2" />
                            <circle cx="12" cy="12" r="2" />
                            <circle cx="12" cy="19" r="2" />
                        </svg>
                    </button>

                    <div className="absolute top-14 right-0 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 flex flex-col gap-2">
                        <button
                            onClick={onClose}
                            aria-label="关闭"
                            className="flex items-center justify-start gap-2 border border-[#C9A063]/30 bg-[#1a1a1a]/95 backdrop-blur w-full px-4 py-2 text-sm font-mono tracking-wider text-[#C9A063]/80 shadow-[0_10px_30px_rgba(0,0,0,0.3)] hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors duration-300 whitespace-nowrap"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <span className="text-sm">关闭</span>
                        </button>
                        {menu}
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="关闭详情"
                    className="flex items-center justify-center w-10 h-10 border border-[#C9A063]/30 bg-[#1a1a1a]/95 backdrop-blur text-[#C9A063]/80 shadow-[0_10px_30px_rgba(0,0,0,0.3)] hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors duration-300 fixed top-8 right-8 z-[121]"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            )}

            <motion.div
                className="fixed right-0 top-0 bottom-0 w-[60%] bg-[#1a1a1a]/95 backdrop-blur-md p-12 overflow-y-auto shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-[120]"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            >
                <div className="max-w-2xl mx-auto space-y-8 pb-40">
                    {/* Header */}
                    <div className="space-y-2">
                        <h1 className="font-display text-4xl md:text-5xl text-[#E8E6DC] tracking-wide">{book.title}</h1>
                        {book.subtitle && <h2 className="font-body text-xl text-white/60 tracking-wide">{book.subtitle}</h2>}
                    </div>

                    {/* Rating & Meta */}
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-light text-[#E8E6DC]">{book.rating}</span>
                            <span className="text-sm text-white/40">/ 10</span>
                        </div>
                        <div className="flex gap-0.5">
                            {[...Array(5)].map((_, i) => {
                                const rating = parseFloat(book.rating);
                                const filled = rating / 2 > i + 0.5;
                                const half = rating / 2 > i && rating / 2 <= i + 0.5;
                                return (
                                    <svg
                                        key={i}
                                        className="w-4 h-4"
                                        viewBox="0 0 24 24"
                                        fill={filled ? "#8B3A3A" : half ? "url(#half)" : "none"}
                                        stroke="#8B3A3A"
                                        strokeWidth="1.5"
                                    >
                                        <defs>
                                            <linearGradient id="half">
                                                <stop offset="50%" stopColor="#8B3A3A" />
                                                <stop offset="50%" stopColor="transparent" />
                                            </linearGradient>
                                        </defs>
                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                    </svg>
                                );
                            })}
                        </div>
                        {meta && (
                            <div className="flex items-center gap-3">
                                <div className="h-4 w-px bg-white/15" aria-hidden="true" />
                                {meta}
                            </div>
                        )}
                    </div>

                    {/* Recommendation */}
                    <div className="bg-[#1a1a1a] border-l-4 border-[#E8E6DC] p-6 my-8 relative">
                        <p className="font-accent text-xl leading-relaxed text-[#E8E6DC]">
                            {book.recommendation || book.reason || "暂无推荐语"}
                        </p>
                    </div>

                    {/* Metadata */}
                    <div className="space-y-6">
                        <div
                            className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-4 text-sm"
                        >
                            <span className="text-white/50 font-light">作者</span>
                            <span className="font-body text-[#E8E6DC] tracking-wide">{book.author}</span>

                            {book.translator && (
                                <>
                                    <span className="text-white/50 font-light">译者</span>
                                    <span className="font-body text-[#E8E6DC] tracking-wide">{book.translator}</span>
                                </>
                            )}

                            <span className="text-white/50 font-light">出版</span>
                            <span className="font-body text-[#E8E6DC] tracking-wide">{book.publisher} · {book.pubYear}</span>

                            {book.pages && (
                                <>
                                    <span className="text-white/50 font-light">页数</span>
                                    <span className="font-body text-[#E8E6DC] tracking-wide">{book.pages}</span>
                                </>
                            )}

                            {book.isbn && (
                                <>
                                    <span className="text-white/50 font-light">ISBN</span>
                                    <span className="font-body text-[#E8E6DC] tracking-wide">{book.isbn}</span>
                                </>
                            )}

                            {book.series && (
                                <>
                                    <span className="text-white/50 font-light">丛书</span>
                                    <span className="font-body text-[#E8E6DC] tracking-wide">{book.series}</span>
                                </>
                            )}

                            {book.producer && (
                                <>
                                    <span className="text-white/50 font-light">出品方</span>
                                    <span className="font-body text-[#E8E6DC] tracking-wide">{book.producer}</span>
                                </>
                            )}
                        </div>

                        {/* 索书号、豆瓣链接与入口专属操作 */}
                        {(book.callNumber || book.doubanLink || actions) && (
                            <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-white/10">
                                {book.callNumber && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-white/40">馆藏</span>
                                        {book.callNumberLink ? (
                                            <a
                                                href={book.callNumberLink}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#C9A063]/20 bg-[#C9A063]/10 text-[#C9A063] font-mono text-xs hover:bg-[#C9A063]/20 transition-colors"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                                </svg>
                                                {book.callNumber}
                                            </a>
                                        ) : (
                                            <span className="px-3 py-1.5 rounded-full border border-[#E8E6DC]/10 bg-[#E8E6DC]/10 font-mono text-xs text-white/40">
                                                {book.callNumber}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {book.doubanLink && (
                                    <a
                                        href={book.doubanLink}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs hover:bg-emerald-500/20 hover:text-emerald-300 transition-colors"
                                    >
                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-8z" />
                                        </svg>
                                        豆瓣页面
                                    </a>
                                )}

                                {actions}
                            </div>
                        )}
                    </div>

                    {/* Deep Reading */}
                    <div className="space-y-8">
                        <section>
                            <div className="relative inline-block mb-5">
                                <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-[#C9A063]/60 translate-x-1.5 translate-y-1.5" />
                                <h3 className="relative border border-[#C9A063]/50 px-5 py-1.5 text-[#E8E6DC] font-display text-lg tracking-wider bg-[#1a1a1a]">
                                    内容简介
                                </h3>
                            </div>
                            <p className="font-info-content leading-loose text-gray-300 whitespace-pre-wrap tracking-wide text-justify">{book.summary}</p>
                        </section>

                        <section>
                            <div className="relative inline-block mb-5">
                                <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-[#C9A063]/60 translate-x-1.5 translate-y-1.5" />
                                <h3 className="relative border border-[#C9A063]/50 px-5 py-1.5 text-[#E8E6DC] font-display text-lg tracking-wider bg-[#1a1a1a]">
                                    作者简介
                                </h3>
                            </div>
                            <p className="font-info-content leading-loose text-gray-300 tracking-wide text-justify">{book.authorIntro}</p>
                        </section>

                        <section>
                            <div className="relative inline-block mb-5">
                                <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-[#C9A063]/60 translate-x-1.5 translate-y-1.5" />
                                <h3 className="relative border border-[#C9A063]/50 px-5 py-1.5 text-[#E8E6DC] font-display text-lg tracking-wider bg-[#1a1a1a]">
                                    目录
                                </h3>
                            </div>
                            <details className="group">
                                <summary className="cursor-pointer inline-flex items-center gap-2 text-sm text-white/40 hover:text-[#C9A063] transition-colors py-2">
                                    <svg
                                        className="w-4 h-4 transition-transform group-open:rotate-90"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                    <span className="font-body">展开查看</span>
                                </summary>
                                <div className="mt-4 pl-6 border-l-2 border-white/10">
                                    <pre className="font-catalog text-sm leading-loose text-gray-300 whitespace-pre-wrap tracking-wide">
                                        {book.catalog}
                                    </pre>
                                </div>
                            </details>
                        </section>
                    </div>
                </div>
            </motion.div>
        </>
    );
}
