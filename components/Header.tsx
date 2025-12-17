'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { motion } from 'framer-motion';
import AboutOverlay from './AboutOverlay';
import SubjectMdOverlay from './SubjectMdOverlay';

interface HeaderProps {
    showHomeButton?: boolean;
    aboutContent?: string;
    theme?: 'light' | 'dark';
    currentBook?: any; // 添加当前书籍信息
    month?: string; // 添加月份信息，用于判断是否为主题页面
}

export default function Header({ showHomeButton = false, aboutContent, theme = 'light', currentBook, month }: HeaderProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [isAboutOpen, setIsAboutOpen] = useState(false);
    const [isVisible, setIsVisible] = useState(true);
    const [lastScrollY, setLastScrollY] = useState(0);
    
    // 主题卡MD内容相关状态
    const [isMdOverlayOpen, setIsMdOverlayOpen] = useState(false);
    const [mdContent, setMdContent] = useState('');
    const [subjectName, setSubjectName] = useState('');
    const [showMdButton, setShowMdButton] = useState(false);

    // 获取主题MD内容的辅助函数
    const getSubjectMdContent = async (subjectPath: string): Promise<string> => {
        try {
            const response = await fetch(subjectPath);
            if (!response.ok) {
                return '';
            }
            return await response.text();
        } catch (error) {
            console.error('加载主题导读内容失败', error);
            return '';
        }
    };

    // 查找主题目录中的MD文件，返回内容和中文标题
    const findSubjectMdFile = async (year: string, subject: string): Promise<{ content: string; label: string } | null> => {
        try {
            // 首先尝试查找目录中的MD文件
            const listPath = `/api/list-md-files?year=${year}&subject=${encodeURIComponent(subject)}`;
            const listResponse = await fetch(listPath);

            if (listResponse.ok) {
                const files = await listResponse.json();
                const mdFile = files.find((file: string) => file.endsWith('.md'));

                if (mdFile) {
                    // 对文件名进行URL编码，确保中文等特殊字符能正确访问
                    const encodedMdFile = encodeURIComponent(mdFile);
                    const mdPath = `/content/${year}/subject/${encodeURIComponent(subject)}/${encodedMdFile}`;
                    const mdResponse = await fetch(mdPath);

                    if (mdResponse.ok) {
                        const content = await mdResponse.text();
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
    };

    // 判断是否为主题页面并检查MD文件是否存在
    useEffect(() => {
        const checkSubjectMd = async () => {
            // 优先使用month参数，如果没有则使用currentBook.month
            const monthToCheck = month || currentBook?.month;

            if (monthToCheck && monthToCheck.includes('-subject-')) {
                const [year, subject] = monthToCheck.split('-subject-');

                try {
                    const result = await findSubjectMdFile(year, subject);
                    if (result) {
                        setSubjectName(result.label);  // 使用从md文件名提取的中文标题
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

    const buttonStyles = theme === 'dark'
        ? "btn-random btn-random--dark px-4 py-2 md:px-5 md:py-2.5 text-sm md:text-base font-body tracking-widest hover:scale-105"
        : "btn-random px-4 py-2 md:px-5 md:py-2.5 text-sm md:text-base font-body tracking-widest hover:scale-105";

    return (
        <header className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
            <div className="relative flex items-center justify-between px-6 py-6 md:px-8 md:py-8">
                {/* Logo - Left */}
                {/* <motion.div
                    className="pointer-events-auto"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <div className="relative w-32 h-20 md:w-40 md:h-24 lg:w-48 lg:h-28 opacity-60 hover:opacity-75 transition-all duration-300">
                        <Image
                            src="/logozi_shl.jpg"
                            alt="机构Logo"
                            fill
                            className={`object-contain object-left grayscale-[30%] sepia-[15%] brightness-110 contrast-90 ${theme === 'dark' ? 'invert opacity-80' : ''}`}
                            priority
                        />
                    </div>
                </motion.div> */}

                {/* Spacer for center alignment */}
                <div className="flex-1" />

                {/* Center Group - Home & About Buttons */}
                <motion.div
                    className="absolute left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-3 z-10"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : -20 }}
                    transition={{ duration: 0.3 }}
                >
                    {showHomeButton && (
                        <>
                            <button
                                onClick={() => router.push('/')}
                                className={buttonStyles}
                                aria-label="返回首页"
                            >
                                <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                                    />
                                </svg>
                                <span>首页</span>
                            </button>

                            {pathname !== '/archive' && (
                                <button
                                    onClick={() => router.push('/archive')}
                                className={buttonStyles}
                                aria-label="往期回顾"
                            >
                                    <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                        />
                                    </svg>
                                    <span>往期</span>
                                </button>
                            )}
                        </>
                    )}

                    {/* Random Walk Button */}
                    {(pathname === '/archive' || (pathname && pathname !== '/' && !pathname.startsWith('/random'))) && (
                        <button
                            onClick={() => router.push('/random')}
                            className={buttonStyles}
                            aria-label="随机漫步"
                        >
                            <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                                />
                            </svg>
                            <span>漫步</span>
                        </button>
                    )}

                    {/* Subject MD Button - Only show for subject pages */}
                    {showMdButton && (
                        <button
                            onClick={handleSubjectMdClick}
                            className={buttonStyles}
                            aria-label="主题导读"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>主题导读</span>
                        </button>
                    )}

                    {/* About Button */}
                    {aboutContent && (
                        <button
                            onClick={() => setIsAboutOpen(true)}
                            className={buttonStyles}
                            aria-label="关于"
                        >
                            <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            <span>关于</span>
                        </button>
                    )}
                </motion.div>

                {/* Right spacer to balance layout */}
                <div className="flex-1" />
            </div>

            {/* About Overlay - Moved outside of header container to prevent transform context issues */}
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
