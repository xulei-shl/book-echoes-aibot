'use client';

import { useEffect, useRef, useState } from 'react';
import { Book } from '@/types';
import BookCard from './BookCard';
import InfoPanel from './InfoPanel';
import Dock from './Dock';
import Header from './Header';
import { useStore } from '@/store/useStore';
import { AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'next/navigation';

interface CanvasProps {
    books: Book[];
    month: string;
    subjectLabel?: string;  // 主题卡的中文标题（从md文件名提取）
}

export default function Canvas({ books, month, subjectLabel }: CanvasProps) {
    const {
        focusedBookId,
        setViewMode,
        setSelectedMonth,
        clearScatterPositions,
        setFocusedBookId
    } = useStore();

    // 添加一个状态来跟踪最后选中的主题卡
    const [lastSubjectBook, setLastSubjectBook] = useState<Book | null>(null);
    const searchParams = useSearchParams();
    const focusId = searchParams?.get('focus');
    const appliedFocusRef = useRef<string | null>(null);

    useEffect(() => {
        setViewMode('canvas');
        setSelectedMonth(month);

        // 组件卸载时清理散布位置,防止内存泄漏
        return () => {
            clearScatterPositions();
        };
    }, [month, setViewMode, setSelectedMonth, clearScatterPositions]);

    useEffect(() => {
        if (!focusId) {
            appliedFocusRef.current = null;
            return;
        }
        if (appliedFocusRef.current === focusId) {
            return;
        }
        const targetExists = books.some(book => book.id === focusId);
        if (targetExists) {
            setFocusedBookId(focusId);
            appliedFocusRef.current = focusId;
        }
    }, [books, focusId, setFocusedBookId]);

    // 处理不同格式的月份参数：
    // - 普通月份: "2025-08"
    // - 睡美人: "2025-sleeping-2025-08"
    // - 主题: "2025-subject-xxx"
    let yearStr: string = '';
    let monthStr: string = '';
    let displayText: string = ''; // 用于主题卡显示的装饰文字

    const sleepingMatch = month.match(/^(\d{4})-sleeping-(\d{4})-(\d{2})$/);
    if (sleepingMatch) {
        yearStr = sleepingMatch[2];
        monthStr = sleepingMatch[3];
    } else {
        const subjectMatch = month.match(/^(\d{4})-subject-(.+)$/);
        if (subjectMatch) {
            // 主题卡处理：优先使用传入的中文标题，否则从路径提取
            yearStr = subjectMatch[1];
            if (subjectLabel) {
                displayText = subjectLabel.substring(0, 2);
            } else {
                // 降级：从路径名提取（英文）
                const subjectName = decodeURIComponent(subjectMatch[2]);
                displayText = subjectName.substring(0, 2);
            }
        } else {
            // 普通月份处理
            [yearStr, monthStr] = month.split('-');
        }
    }

    const yearCN = yearStr.split('').map(d => '零一二三四五六七八九'[parseInt(d)]).join('');
    
    // 根据不同类型设置显示文字
    let monthCN: string;
    if (displayText) {
        // 主题卡使用提取的前两个汉字
        monthCN = displayText;
    } else {
        // 月份牌和睡美人使用月份
        const monthInt = parseInt(monthStr);
        monthCN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'][monthInt - 1];
    }

    const focusedBook = books.find(b => b.id === focusedBookId);

    // 当有书籍被选中时，检查是否是主题卡
    useEffect(() => {
        if (focusedBook && focusedBook.month?.includes('-subject-')) {
            setLastSubjectBook(focusedBook);
        }
    }, [focusedBook]);

    // 传递最后选中的主题卡给Header
    const currentBookForHeader = focusedBook || lastSubjectBook;

    return (
        <div className="relative w-screen h-screen overflow-hidden bg-[#1a1a1a]">
            {/* Background Layer: Subtle Radial Gradient */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background: 'radial-gradient(circle at 50% 50%, #2a2a2a 0%, #1a1a1a 60%, #111111 100%)'
                }}
            />

            {/* Background Layer: Typographic Watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden select-none z-0">
                <div className="relative flex flex-col items-center justify-center opacity-[0.05] transform scale-150">
                    <div className="font-display text-[15vw] leading-none text-[#E8E6DC] tracking-[0.2em] whitespace-nowrap">
                        {yearCN}
                    </div>
                    <div className="font-display text-[25vw] leading-none text-[#E8E6DC] font-bold tracking-widest mt-[-2vw]">
                        {monthCN}{displayText ? '' : '月'}
                    </div>
                </div>
            </div>

            <div className="noise-overlay" />

            {/* Header with Logo and Home Button */}
            <Header showHomeButton={true} theme="dark" currentBook={currentBookForHeader} month={month} />
            
  
            {/* Books Layer */}
            <div className="absolute inset-0 z-10">
                {books.map((book, index) => (
                    <BookCard
                        key={book.id}
                        book={book}
                        state={focusedBookId ? 'focused' : 'scatter'}
                        index={index}
                    />
                ))}
            </div>

            {/* Info Panel Layer */}
            <AnimatePresence>
                {focusedBook && <InfoPanel key="panel" book={focusedBook} books={books} />}
            </AnimatePresence>

            {/* Dock Layer */}
            <Dock books={books} />
        </div>
    );
}
