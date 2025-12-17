'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ArchiveYearNav from './ArchiveYearNav';
import MagazineCard from './MagazineCard';
import { YearArchiveData, ArchiveItem } from '@/lib/content';

interface ArchiveContentProps {
    years: string[];
    archiveData: YearArchiveData[];
}

// 辅助函数：将月份转换为繁体汉字
// 支持格式: "2025-08" 或 "2025-sleeping-2025-08"
function getMonthCharacter(monthId: string): string {
    const monthChars = ['', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾', '冬', '臘'];

    // 尝试从末尾提取月份数字（处理 2025-sleeping-2025-08 这种格式）
    const match = monthId.match(/-(\d{2})$/);
    if (match) {
        const monthNum = parseInt(match[1]);
        if (monthNum >= 1 && monthNum <= 12) {
            return monthChars[monthNum];
        }
    }

    return '月';
}

// 辅助函数:获取初始年份(当前年份或最接近的年份)
function getInitialYear(years: string[]): string {
    if (years.length === 0) return '';

    const currentYear = new Date().getFullYear().toString();

    // 如果当前年份在列表中,直接返回
    if (years.includes(currentYear)) {
        return currentYear;
    }

    // 否则找到最接近当前年份的年份
    const sortedYears = [...years].sort((a, b) => parseInt(b) - parseInt(a));
    const currentYearNum = parseInt(currentYear);

    // 找到第一个小于等于当前年份的年份
    const closestYear = sortedYears.find(year => parseInt(year) <= currentYearNum);

    // 如果找到了,返回它;否则返回最小的年份
    return closestYear || sortedYears[sortedYears.length - 1];
}

export default function ArchiveContent({ years, archiveData }: ArchiveContentProps) {
    const [activeYear, setActiveYear] = useState(getInitialYear(years));
    const [activeTab, setActiveTab] = useState<'month' | 'subject' | 'sleeping_beauty'>('month');

    // Reset tab to month when year changes
    // Reset tab to month when year changes
    useEffect(() => {
        setActiveTab('month');
    }, [activeYear]);

    const currentYearData = archiveData.find(d => d.year === activeYear);
    const months = currentYearData?.months || [];
    const subjects = currentYearData?.subjects || [];
    const sleepingBeauties = currentYearData?.sleepingBeauties || [];

    const hasMonths = months.length > 0;
    const hasSubjects = subjects.length > 0;
    const hasSleepingBeauties = sleepingBeauties.length > 0;

    // Determine what to show
    let itemsToShow: ArchiveItem[] = [];
    if (activeTab === 'month') {
        itemsToShow = months;
    } else if (activeTab === 'subject') {
        itemsToShow = subjects;
    } else if (activeTab === 'sleeping_beauty') {
        itemsToShow = sleepingBeauties;
    }

    const isEmpty = itemsToShow.length === 0;

    return (
        <div className="relative z-10 pt-32 pb-20 px-4 md:px-8">
            <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12">
                {/* Left Sidebar - Year Navigation */}
                <aside className="md:col-span-2 hidden md:block sticky top-32 h-fit">
                    <ArchiveYearNav
                        years={years}
                        activeYear={activeYear}
                        onYearSelect={setActiveYear}
                    />
                </aside>

                {/* Right Content - Cover Grid */}
                <main className="md:col-span-10 min-h-[60vh]">
                    <div className="mb-8 border-b border-[#C9A063]/20 pb-4 flex flex-col md:flex-row md:items-end gap-4 justify-between">
                        {/* Tab Switcher - Left Side */}
                        {(hasMonths || hasSubjects || hasSleepingBeauties) && (
                            <div className="flex items-center gap-6 mb-1 order-2 md:order-1">
                                <button
                                    onClick={() => setActiveTab('month')}
                                    className={`text-sm tracking-widest transition-colors duration-300 relative pb-1 ${activeTab === 'month'
                                        ? 'text-[#C9A063]'
                                        : 'text-[#C9A063]/40 hover:text-[#C9A063]/70'
                                        }`}
                                >
                                    月份牌
                                    {activeTab === 'month' && (
                                        <motion.div
                                            layoutId="activeTabIndicator"
                                            className="absolute bottom-0 left-0 right-0 h-[1px] bg-[#C9A063]"
                                        />
                                    )}
                                </button>
                                <button
                                    onClick={() => setActiveTab('sleeping_beauty')}
                                    className={`text-sm tracking-widest transition-colors duration-300 relative pb-1 ${activeTab === 'sleeping_beauty'
                                        ? 'text-[#C9A063]'
                                        : 'text-[#C9A063]/40 hover:text-[#C9A063]/70'
                                        }`}
                                >
                                    睡美人
                                    {activeTab === 'sleeping_beauty' && (
                                        <motion.div
                                            layoutId="activeTabIndicator"
                                            className="absolute bottom-0 left-0 right-0 h-[1px] bg-[#C9A063]"
                                        />
                                    )}
                                </button>
                                <button
                                    onClick={() => setActiveTab('subject')}
                                    className={`text-sm tracking-widest transition-colors duration-300 relative pb-1 ${activeTab === 'subject'
                                        ? 'text-[#C9A063]'
                                        : 'text-[#C9A063]/40 hover:text-[#C9A063]/70'
                                        }`}
                                >
                                    主题卡
                                    {activeTab === 'subject' && (
                                        <motion.div
                                            layoutId="activeTabIndicator"
                                            className="absolute bottom-0 left-0 right-0 h-[1px] bg-[#C9A063]"
                                        />
                                    )}
                                </button>
                            </div>
                        )}

                        {/* Title - Right Side */}
                        <div className="flex items-end gap-4 order-1 md:order-2 ml-auto">
                            <h2 className="font-display text-3xl md:text-4xl text-[#C9A063]">
                                {activeYear}
                            </h2>
                            <span className="text-sm font-mono text-[#C9A063]/40 mb-1 tracking-widest">ARCHIVE COLLECTION</span>
                        </div>
                    </div>

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={`${activeYear}-${activeTab}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                        >
                            {isEmpty ? (
                                <div className="flex flex-col items-center justify-center h-[400px] text-[#C9A063]/40 font-display text-xl tracking-widest border border-[#C9A063]/10 bg-[#1a1a1a]/30">
                                    COMING SOON
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
                                    {itemsToShow.map((item, index) => {
                                        // 月份牌和睡美人都按月份排列，使用繁体汉字；主题卡使用label首字符
                                        const monthChar = activeTab === 'subject'
                                            ? item.label.charAt(0)
                                            : getMonthCharacter(item.id);

                                        return (
                                            <div
                                                key={item.id}
                                                className="relative group p-6 border border-[#C9A063]/20 bg-[#1a1a1a]/50 hover:border-[#C9A063]/60 hover:bg-[#C9A063]/5 transition-all duration-500 overflow-hidden"
                                            >
                                                {/* 大型繁体汉字背景 - 右下角位置 */}
                                                <div className="absolute -bottom-14 -right-10 pointer-events-none select-none">
                                                    <span
                                                        className="font-display text-[16rem] md:text-[18rem] leading-none text-[#C9A063] transition-all duration-700 ease-out block"
                                                        style={{
                                                            opacity: 0.12,
                                                            transform: 'rotate(-5deg)',
                                                        }}
                                                    >
                                                        {monthChar}
                                                    </span>
                                                </div>

                                                {/* 悬停时的汉字动画效果 */}
                                                <div className="absolute -bottom-14 -right-10 pointer-events-none select-none opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                                                    <span
                                                        className="font-display text-[16rem] md:text-[18rem] leading-none text-[#C9A063] transition-all duration-700 ease-out block"
                                                        style={{
                                                            opacity: 0.18,
                                                            transform: 'rotate(-5deg) scale(1.05)',
                                                        }}
                                                    >
                                                        {monthChar}
                                                    </span>
                                                </div>

                                                {/* Corner Accents */}
                                                <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#C9A063]/40 group-hover:border-[#C9A063] group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-500 z-10" />
                                                <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-[#C9A063]/40 group-hover:border-[#C9A063] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-500 z-10" />
                                                <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-[#C9A063]/40 group-hover:border-[#C9A063] group-hover:-translate-x-0.5 group-hover:translate-y-0.5 transition-all duration-500 z-10" />
                                                <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#C9A063]/40 group-hover:border-[#C9A063] group-hover:translate-x-0.5 group-hover:translate-y-0.5 transition-all duration-500 z-10" />

                                                {/* Technical Label */}
                                                <div className="absolute top-2 left-3 text-[10px] font-mono text-[#C9A063]/60 tracking-widest opacity-70 group-hover:opacity-100 transition-opacity z-10">
                                                    {activeTab === 'month' ? item.id.replace('-', '.') : item.id}
                                                </div>

                                                {/* Card Content */}
                                                {/* MagazineCard expects MonthData, which is compatible with ArchiveItem */}
                                                <MagazineCard month={item} className="h-[360px] relative z-10" />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>
        </div>
    );
}
