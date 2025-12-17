'use client';

import { motion } from 'framer-motion';
import { Book } from '@/types';
import { useStore } from '@/store/useStore';

interface InfoPanelProps {
    book: Book;
    books: Book[];
}

export default function InfoPanel({ book, books }: InfoPanelProps) {
    const { setFocusedBookId } = useStore();

    const handleNavigate = (direction: 'prev' | 'next') => {
        if (!books?.length) {
            return;
        }
        const currentIndex = books.findIndex((entry) => entry.id === book.id);
        if (currentIndex === -1) {
            return;
        }
        const delta = direction === 'next' ? 1 : -1;
        const nextIndex = (currentIndex + delta + books.length) % books.length;
        setFocusedBookId(books[nextIndex].id);
    };

    return (
        <>
            {/* Navigation Buttons - Outside panel */}
            <button
                type="button"
                aria-label="上一条书籍"
                className="btn-random btn-random--dark btn-random--circle btn-random--circle-lg fixed left-[calc(40%+2rem)] top-1/2 -translate-y-1/2 z-[121] text-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] hover:scale-105"
                onClick={() => handleNavigate('prev')}
            >
                &larr;
            </button>
            <button
                type="button"
                aria-label="下一条书籍"
                className="btn-random btn-random--dark btn-random--circle btn-random--circle-lg fixed right-8 top-1/2 -translate-y-1/2 z-[121] text-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] hover:scale-105"
                onClick={() => handleNavigate('next')}
            >
                &rarr;
            </button>


            {/* Three-dot Menu Button - Outside panel */}
            <div
                className="fixed top-8 right-8 z-[121] group"
            >
                {/* Three-dot button */}
                <button
                    aria-label="菜单"
                    className="btn-random btn-random--dark btn-random--circle shadow-[0_10px_30px_rgba(0,0,0,0.5)] hover:scale-105"
                >
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                    </svg>
                </button>

                {/* Dropdown menu - appears on hover */}
                <div className="absolute top-14 right-0 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 flex flex-col gap-2">
                    {/* Close button */}
                    <button
                        onClick={() => setFocusedBookId(null)}
                        aria-label="关闭"
                        className="btn-random btn-random--dark px-4 py-2 text-sm shadow-[0_10px_30px_rgba(0,0,0,0.5)] whitespace-nowrap"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span className="text-sm">关闭</span>
                    </button>

                    {/* Download current book button */}
                    <button
                        onClick={async () => {
                            try {
                                const month = book.month;
                                if (!month) {
                                    alert('无法确定月份路径');
                                    return;
                                }

                                // 构建路径获取完整的 metadata.json
                                let metadataPath = '';

                                if (month.includes('-subject-')) {
                                    // 主题卡: 2025-subject-科幻 -> /content/2025/subject/科幻/metadata.json
                                    const parts = month.split('-subject-');
                                    const year = parts[0];
                                    const subjectName = parts[1];
                                    metadataPath = `/content/${year}/subject/${subjectName}/metadata.json`;
                                } else if (month.includes('-sleeping-')) {
                                    // 睡美人: 2025-sleeping-xxx -> /content/2025/new/xxx/metadata.json
                                    const parts = month.split('-sleeping-');
                                    const year = parts[0];
                                    const newName = parts[1];
                                    metadataPath = `/content/${year}/new/${newName}/metadata.json`;
                                } else {
                                    // 月份牌: 2025-08 -> /content/2025/2025-08/metadata.json
                                    const year = month.split('-')[0];
                                    metadataPath = `/content/${year}/${month}/metadata.json`;
                                }

                                // 获取完整的 metadata.json
                                const response = await fetch(metadataPath);
                                if (!response.ok) {
                                    throw new Error(`HTTP error! status: ${response.status}`);
                                }
                                const metadata = await response.json();

                                // 从 metadata 中找到当前书籍的完整数据
                                // 注意：metadata.json 中的字段是 '书目条码'，可能是字符串或数字
                                const fullBookData = metadata.find((item: any) => String(item['书目条码']) === String(book.id));

                                if (!fullBookData) {
                                    console.error('查找失败:', { bookId: book.id, metadataLength: metadata.length });
                                    throw new Error('未找到该书籍的完整数据');
                                }

                                // 下载完整的书籍数据
                                const blob = new Blob([JSON.stringify(fullBookData, null, 2)], { type: 'application/json' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `book_${book.id}.json`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                            } catch (error) {
                                console.error('下载失败:', error);
                                alert('下载失败，请重试');
                            }
                        }}
                        aria-label="下载当前书籍"
                        className="btn-random btn-random--dark px-4 py-2 text-sm shadow-[0_10px_30px_rgba(0,0,0,0.5)] whitespace-nowrap"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span className="text-sm">下载</span>
                    </button>

                    {/* Download all metadata button */}
                    <button
                        onClick={async () => {
                            try {
                                const month = book.month;
                                if (!month) {
                                    alert('无法确定月份路径');
                                    return;
                                }

                                // 构建新的路径: /content/{year}/{month}/metadata.json
                                // month 格式为 "2025-08" 或 "2025-subject-科幻" 或 "2025-sleeping-xxx"
                                let metadataPath = '';

                                if (month.includes('-subject-')) {
                                    // 主题卡: 2025-subject-科幻 -> /content/2025/subject/科幻/metadata.json
                                    const [year, subjectName] = month.split('-subject-');
                                    metadataPath = `/content/${year}/subject/${subjectName}/metadata.json`;
                                } else if (month.includes('-sleeping-')) {
                                    // 睡美人: 2025-sleeping-xxx -> /content/2025/new/xxx/metadata.json
                                    const [year, newName] = month.split('-sleeping-');
                                    metadataPath = `/content/${year}/new/${newName}/metadata.json`;
                                } else {
                                    // 月份牌: 2025-08 -> /content/2025/2025-08/metadata.json
                                    const year = month.split('-')[0];
                                    metadataPath = `/content/${year}/${month}/metadata.json`;
                                }

                                // Fetch metadata.json
                                const response = await fetch(metadataPath);
                                if (!response.ok) {
                                    throw new Error(`HTTP error! status: ${response.status}`);
                                }
                                const metadata = await response.json();

                                // Download as JSON file
                                const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `metadata_${month}.json`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                            } catch (error) {
                                console.error('下载失败:', error);
                                alert('下载失败，请重试');
                            }
                        }}
                        aria-label="下载全部数据"
                        className="btn-random btn-random--dark px-4 py-2 text-sm shadow-[0_10px_30px_rgba(0,0,0,0.5)] whitespace-nowrap"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                        </svg>
                        <span className="text-sm">全部下载</span>
                    </button>
                </div>
            </div>

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

                    {/* Rating */}
                    <div className="flex items-center gap-3">
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

                        {/* 索书号与豆瓣链接 */}
                        <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-white/10">
                            {book.callNumber && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-white/40">馆藏</span>
                                    {book.callNumberLink ? (
                                        <a
                                            href={book.callNumberLink}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#C9A063]/10 text-[#C9A063] font-mono text-xs hover:bg-[#C9A063]/20 transition-colors"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                            </svg>
                                            {book.callNumber}
                                        </a>
                                    ) : (
                                        <span className="px-3 py-1.5 rounded-full bg-[#E8E6DC]/10 font-mono text-xs text-white/40">
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
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-xs hover:bg-green-100 transition-colors"
                                >
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-8z" />
                                    </svg>
                                    豆瓣页面
                                </a>
                            )}
                        </div>
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
