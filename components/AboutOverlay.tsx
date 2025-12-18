'use client';

import { AnimatePresence, motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from '@/lib/markdownComponents';

interface AboutOverlayProps {
    content: string;
    isOpen: boolean;
    onClose: () => void;
}

export default function AboutOverlay({ content, isOpen, onClose }: AboutOverlayProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        className="fixed inset-0 bg-[#000000]/90 backdrop-blur-sm z-[140] pointer-events-auto"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />
                    <motion.div
                        id="about-overlay"
                        role="dialog"
                        aria-modal="true"
                        className="fixed inset-x-4 md:inset-x-20 lg:inset-x-32 top-12 bottom-12 bg-[#1a1a1a]/90 backdrop-blur-xl border border-[#C9A063]/30 overflow-hidden z-[150] pointer-events-auto flex flex-col"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    >
                        {/* Corner Accents */}
                        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#C9A063] z-20" />
                        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#C9A063] z-20" />
                        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#C9A063] z-20" />
                        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#C9A063] z-20" />

                        {/* Background Watermark */}
                        <div className="absolute -bottom-20 -right-10 pointer-events-none select-none opacity-[0.03] z-0">
                            <span className="font-display text-[20rem] leading-none text-[#C9A063] block transform -rotate-12">
                                关于
                            </span>
                        </div>

                        {/* Header Bar */}
                        <div className="flex items-center justify-between px-6 md:px-10 py-6 border-b border-[#C9A063]/20 relative z-10 bg-[#1a1a1a]">
                            <div className="flex items-center gap-4">
                                <div className="w-2 h-2 bg-[#C9A063]" />
                                <span className="font-mono text-[#C9A063] tracking-[0.3em] text-sm uppercase">
                                    About
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={onClose}
                                className="group relative w-10 h-10 flex items-center justify-center border border-[#C9A063]/30 hover:bg-[#C9A063] transition-colors duration-300"
                                aria-label="Close"
                            >
                                <span className="font-mono text-[#C9A063] group-hover:text-[#1a1a1a] text-xl transition-colors">×</span>
                                {/* Button Corner Accents */}
                                <div className="absolute top-0 left-0 w-1 h-1 border-t border-l border-[#C9A063] opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="absolute bottom-0 right-0 w-1 h-1 border-b border-r border-[#C9A063] opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="relative flex-1 overflow-hidden z-10">
                            <div className="about-overlay-scroll absolute inset-0 overflow-y-auto px-6 md:px-10 py-8">
                                <div className="max-w-4xl mx-auto">
                                    {content ? (
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={markdownComponents}
                                        >
                                            {content}
                                        </ReactMarkdown>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-64 border border-dashed border-[#C9A063]/20 bg-[#C9A063]/5">
                                            <p className="font-mono text-[#C9A063] text-lg mb-2">NO_DATA_FOUND</p>
                                            <p className="text-[#C9A063]/50 text-sm">Please check public/About.md</p>
                                        </div>
                                    )}
                                </div>

                                {/* Footer Spacing */}
                                <div className="h-20" />
                            </div>

                            {/* Bottom Fade */}
                            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#1a1a1a] to-transparent pointer-events-none" />
                        </div>

                        {/* Footer Status Bar */}
                        <div className="px-6 md:px-10 py-3 border-t border-[#C9A063]/20 flex justify-between items-center bg-[#1a1a1a] relative z-10">
                            <span className="font-mono text-[10px] text-[#C9A063]/40 tracking-widest">
                                BOOK ECHOES SHANGHAI LIBRARY
                            </span>
                            <div className="flex gap-2">
                                <div className="w-1 h-1 bg-[#C9A063]/40 rounded-full animate-pulse" />
                                <div className="w-1 h-1 bg-[#C9A063]/40 rounded-full" />
                                <div className="w-1 h-1 bg-[#C9A063]/40 rounded-full" />
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
