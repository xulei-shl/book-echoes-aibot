'use client';

/**
 * 全站统一的顶部导航栏。
 *
 * 所有页面的顶部导航（Logo、导航按钮、关于/主题导读弹层）共用这一套逻辑：
 * - 首页 (/)：仅显示 Logo（按钮组隐藏）
 * - 往期 (/archive)：首页 + 往期 + 漫步 + 关于
 * - 漫步 (/random)：首页 + 往期
 * - 检索 (/search)：首页 + 往期 + 漫步 + 关于
 * - 期刊/主题/文学FM (/YYYY-MM 等)：首页 + 往期 + 漫步 + 主题导读 + 关于
 *
 * 深色主题按钮为直角描边风格（无圆角），与全站直角设计语言一致。
 */

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import AboutOverlay from './AboutOverlay';
import SubjectMdOverlay from './SubjectMdOverlay';

export interface TopNavProps {
    /** 是否显示顶部按钮组；false 时仅显示 Logo（首页用） */
    showButtons?: boolean;
    /** 关于弹层内容；缺省时隐藏"关于"按钮 */
    aboutContent?: string;
    /** 主题色：dark = 金字深底（默认），light = 金字浅底 */
    theme?: 'light' | 'dark';
    /** 当前书籍信息（用于判断是否显示"主题导读"按钮） */
    currentBook?: { month?: string } | null;
    /** 月份路由参数（用于判断是否显示"主题导读"按钮） */
    month?: string;
}

/** 获取主题MD内容的辅助函数 */
async function fetchText(url: string): Promise<string> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            return '';
        }
        return await response.text();
    } catch (error) {
        console.error('加载失败', url, error);
        return '';
    }
}

/** 查找主题目录中的MD文件，返回内容和中文标题 */
async function findSubjectMdFile(
    year: string,
    subject: string,
    type: 'subject' | 'literature' = 'subject'
): Promise<{ content: string; label: string } | null> {
    try {
        const listPath = `/api/list-md-files?year=${year}&type=${type}&subject=${encodeURIComponent(subject)}`;
        const listResponse = await fetch(listPath);

        if (listResponse.ok) {
            const files = await listResponse.json();
            const mdFile = files.find((file: string) => file.endsWith('.md'));

            if (mdFile) {
                // 对文件名进行URL编码，确保中文等特殊字符能正确访问
                const encodedMdFile = encodeURIComponent(mdFile);
                const mdPath = `/content/${year}/${type}/${encodeURIComponent(subject)}/${encodedMdFile}`;
                const content = await fetchText(mdPath);

                if (content) {
                    // 从文件名提取中文标题（去掉.md后缀，取冒号前的主标题）
                    const fileName = mdFile.replace(/\.md$/, '');
                    const label = fileName.split(/[：:]/)[0].trim() || fileName;
                    return { content, label };
                }
            }
        }

        return null;
    } catch (error) {
        console.error('获取主题MD文件失败', error);
        return null;
    }
}

/** 带图标与文字的导航按钮（全站统一渲染，避免 JSX 重复） */
function NavButton({ icon, label, onClick, ariaLabel, className }: { icon: React.ReactNode; label: string; onClick: () => void; ariaLabel: string; className: string }) {
    return (
        <button onClick={onClick} className={className} aria-label={ariaLabel}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {icon}
            </svg>
            <span>{label}</span>
        </button>
    );
}

export default function TopNav({
    showButtons = true,
    aboutContent,
    theme = 'dark',
    currentBook,
    month
}: TopNavProps) {
    const router = useRouter();
    const pathname = usePathname();

    // 关于弹层
    const [isAboutOpen, setIsAboutOpen] = useState(false);

    // 向下滚动时隐藏、向上滚动时显示
    const [isVisible, setIsVisible] = useState(true);
    const [lastScrollY, setLastScrollY] = useState(0);

    // 主题卡MD内容相关状态
    const [isMdOverlayOpen, setIsMdOverlayOpen] = useState(false);
    const [mdContent, setMdContent] = useState('');
    const [subjectName, setSubjectName] = useState('');
    const [showMdButton, setShowMdButton] = useState(false);

    // 判断是否为主题页面或文学FM页面并检查MD文件是否存在
    useEffect(() => {
        const checkSubjectMd = async () => {
            // 优先使用month参数，如果没有则使用currentBook.month
            const monthToCheck = month || currentBook?.month;

            if (monthToCheck && (monthToCheck.includes('-subject-') || monthToCheck.includes('-literature-'))) {
                // 解析年份和类型（subject或literature）
                const isLiterature = monthToCheck.includes('-literature-');
                const [year, subject] = monthToCheck.split(isLiterature ? '-literature-' : '-subject-');
                const type: 'subject' | 'literature' = isLiterature ? 'literature' : 'subject';

                try {
                    const result = await findSubjectMdFile(year, subject, type);
                    if (result) {
                        setSubjectName(result.label); // 使用从md文件名提取的中文标题
                        setMdContent(result.content);
                        setShowMdButton(true);
                    } else {
                        setShowMdButton(false);
                    }
                } catch (error) {
                    console.error('检测主题MD状态失败', error);
                    setShowMdButton(false);
                }
            } else {
                setShowMdButton(false);
            }
        };

        checkSubjectMd();
    }, [month, currentBook]);

    // 处理主题MD按钮点击
    const handleSubjectMdClick = () => {
        setIsMdOverlayOpen(true);
    };

    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            if (currentScrollY > lastScrollY && currentScrollY > 50) {
                setIsVisible(false);
            } else {
                setIsVisible(true);
            }
            setLastScrollY(currentScrollY);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [lastScrollY]);

    const isDark = theme === 'dark';
    const buttonStyles = isDark
        ? 'flex items-center justify-center gap-2 border border-[#C9A063]/40 bg-[#161514]/90 px-4 py-2 md:px-5 md:py-2.5 text-sm md:text-base font-mono tracking-wider text-[#F2F0E9] shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-blur-md hover:bg-[#C9A063] hover:text-[#161514] transition-all duration-300'
        : 'flex items-center justify-center gap-2 border border-[#C9A063]/30 bg-transparent px-4 py-2 md:px-5 md:py-2.5 text-sm md:text-base font-mono tracking-wider text-[#C9A063]/80 hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors duration-300';

    const isArchive = pathname === '/archive';

    return (
        <header className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
            {isDark && (
                <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#0e0d0c]/90 via-[#0e0d0c]/60 to-transparent" />
            )}
            <div className="relative flex items-center justify-between px-6 py-6 md:px-8 md:py-8">
                {/* Logo - Left */}
                <Link href="/" className="pointer-events-auto opacity-70 hover:opacity-100 transition-opacity duration-300">
                    <Image src="/favicon.png" alt="Logo" width={40} height={40} className="h-8 w-auto md:h-10" priority />
                </Link>

                {/* Spacer for center alignment */}
                <div className="flex-1" />

                {/* Center Group - Navigation Buttons */}
                {showButtons && (
                    <motion.div
                        className="absolute left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-3 z-10"
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : -20 }}
                        transition={{ duration: 0.3 }}
                    >
                        {pathname !== '/' && (
                            <NavButton
                                onClick={() => router.push('/')}
                                ariaLabel="返回首页"
                                label="首页"
                                className={buttonStyles}
                                icon={
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                                    />
                                }
                            />
                        )}

                        {pathname !== '/archive' && (
                            <NavButton
                                onClick={() => router.push('/archive')}
                                ariaLabel="往期回顾"
                                label="往期"
                                className={buttonStyles}
                                icon={
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                    />
                                }
                            />
                        )}

                        {/* 检索按钮：按环境变量开关，且不在首页/检索页显示 */}
                        {process.env.NEXT_PUBLIC_ENABLE_SEMANTIC_SEARCH === '1' &&
                            pathname &&
                            pathname !== '/' &&
                            pathname !== '/search' && (
                                <NavButton
                                    onClick={() => router.push('/search')}
                                    ariaLabel="语义检索"
                                    label="检索"
                                    className={buttonStyles}
                                    icon={
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
                                        />
                                    }
                                />
                            )}

                        {/* 随机漫步按钮：归档页显示，其他非首页/漫步页也显示 */}
                        {(isArchive || (pathname && pathname !== '/' && !pathname.startsWith('/random'))) && (
                            <NavButton
                                onClick={() => router.push('/random')}
                                ariaLabel="随机漫步"
                                label="漫步"
                                className={buttonStyles}
                                icon={
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                                    />
                                }
                            />
                        )}

                        {/* 主题导读按钮：仅主题/文学FM页面显示 */}
                        {showMdButton && (
                            <NavButton
                                onClick={handleSubjectMdClick}
                                ariaLabel="主题导读"
                                label="导读"
                                className={buttonStyles}
                                icon={
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                    />
                                }
                            />
                        )}

                        {/* 关于按钮 */}
                        {aboutContent && (
                            <NavButton
                                onClick={() => setIsAboutOpen(true)}
                                ariaLabel="关于"
                                label="关于"
                                className={buttonStyles}
                                icon={
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                }
                            />
                        )}
                    </motion.div>
                )}

                {/* Right spacer to balance layout */}
                <div className="flex-1" />
            </div>

            {/* About Overlay - 放在 header 容器外，避免 transform 上下文影响定位 */}
            {aboutContent && (
                <AboutOverlay
                    content={aboutContent}
                    isOpen={isAboutOpen}
                    onClose={() => setIsAboutOpen(false)}
                />
            )}

            {/* Subject MD Overlay */}
            <SubjectMdOverlay
                content={mdContent}
                subjectName={subjectName}
                isOpen={isMdOverlayOpen}
                onClose={() => setIsMdOverlayOpen(false)}
            />
        </header>
    );
}
