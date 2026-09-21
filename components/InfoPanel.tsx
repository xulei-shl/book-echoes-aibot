'use client';

import { Book } from '@/types';
import { useStore } from '@/store/useStore';
import BookDetailPanel from './BookDetailPanel';

interface InfoPanelProps {
    book: Book;
    books: Book[];
}

/**
 * 画板详情面板：把「书籍列表 → 上/下一条」的导航接到 store，
 * 展示层复用公共组件 BookDetailPanel，并注入画板专属的下载菜单。
 */
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
        <BookDetailPanel
            book={book}
            onClose={() => setFocusedBookId(null)}
            onPrev={() => handleNavigate('prev')}
            onNext={() => handleNavigate('next')}
            menu={<DownloadMenu book={book} />}
        />
    );
}

/** 画板专属菜单项：下载当前书籍 / 下载整月 metadata */
function DownloadMenu({ book }: { book: Book }) {
    const downloadCurrentBook = async () => {
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
            } else if (month.includes('-literature-')) {
                // 文学FM: 2025-literature-xxx -> /content/2025/literature/xxx/metadata.json
                const parts = month.split('-literature-');
                const year = parts[0];
                const literatureName = parts[1];
                metadataPath = `/content/${year}/literature/${literatureName}/metadata.json`;
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
            const fullBookData = metadata.find((item: { '书目条码'?: string | number }) => String(item['书目条码']) === String(book.id));

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
    };

    const downloadAllMetadata = async () => {
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
            } else if (month.includes('-literature-')) {
                // 文学FM: 2025-literature-xxx -> /content/2025/literature/xxx/metadata.json
                const [year, literatureName] = month.split('-literature-');
                metadataPath = `/content/${year}/literature/${literatureName}/metadata.json`;
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
    };

    return (
        <>
            <button
                onClick={downloadCurrentBook}
                aria-label="下载当前书籍"
                className="flex items-center justify-start gap-2 border border-[#C9A063]/30 bg-[#1a1a1a]/95 backdrop-blur w-full px-4 py-2 text-sm font-mono tracking-wider text-[#C9A063]/80 shadow-[0_10px_30px_rgba(0,0,0,0.3)] hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors duration-300 whitespace-nowrap"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span className="text-sm">下载</span>
            </button>

            <button
                onClick={downloadAllMetadata}
                aria-label="下载全部数据"
                className="flex items-center justify-start gap-2 border border-[#C9A063]/30 bg-[#1a1a1a]/95 backdrop-blur w-full px-4 py-2 text-sm font-mono tracking-wider text-[#C9A063]/80 shadow-[0_10px_30px_rgba(0,0,0,0.3)] hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors duration-300 whitespace-nowrap"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
                <span className="text-sm">全部下载</span>
            </button>
        </>
    );
}
