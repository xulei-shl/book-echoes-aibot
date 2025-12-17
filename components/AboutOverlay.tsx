'use client';

import { AnimatePresence, motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';

interface AboutOverlayProps {
    content: string;
    isOpen: boolean;
    onClose: () => void;
}

const markdownComponents: Components = {
    h1: (props) => (
        <h1
            className="font-accent text-4xl md:text-5xl text-[#D4A574] tracking-wide mb-8 border-b border-[#D4A574]/30 pb-4"
            {...props}
        />
    ),
    h2: (props) => (
        <h2
            className="font-accent text-3xl md:text-4xl text-[#C9A063] mt-10 mb-4 flex items-center gap-3"
            {...props}
        >
            <span className="w-1.5 h-1.5 bg-[#C9A063] rounded-sm" />
            {props.children}
        </h2>
    ),
    h3: (props) => (
        <h3
            className="font-accent text-2xl md:text-3xl text-[#B8956A] mt-8 mb-3 tracking-wide"
            {...props}
        />
    ),
    h4: (props) => (
        <h4
            className="font-accent text-2xl md:text-3xl text-[#E8D4B0] mt-6 mb-2 tracking-wide font-semibold"
            {...props}
        />
    ),
    h5: (props) => (
        <h5
            className="font-accent text-sm text-[#D4C5A0] mt-4 mb-2 tracking-wide font-semibold"
            {...props}
        />
    ),
    h6: (props) => (
        <h6
            className="font-accent text-xs text-[#C9B890] mt-3 mb-2 tracking-wide font-semibold uppercase"
            {...props}
        />
    ),
    p: (props) => (
        <p
            className="font-accent text-xl leading-relaxed text-[#D4D4D4] mb-6 whitespace-pre-wrap tracking-normal text-justify"
            {...props}
        />
    ),
    ul: (props) => (
        <ul className="list-none space-y-2 text-[#D4D4D4] mb-6 tracking-normal" {...props} />
    ),
    ol: (props) => (
        <ol className="list-decimal list-inside space-y-2 text-[#D4D4D4] mb-6 tracking-normal" {...props} />
    ),
    li: (props) => (
        <li className="font-info-content text-base leading-relaxed flex gap-3" {...props}>
            <span className="text-[#7B9DAE] mt-1 text-xs">◆</span>
            <span>{props.children}</span>
        </li>
    ),
    hr: () => <div className="my-10 border-t border-[#D4A574]/30" />,
    strong: (props) => (
        <strong className="text-[#C9A063] font-semibold" {...props} />
    ),
    em: (props) => (
        <em className="text-[#B8C5D0] italic font-info-content" {...props} />
    ),
    blockquote: (props) => (
        <blockquote
            className="border-l-2 border-[#7B9DAE] pl-6 italic text-[#B8C5D0] my-8 tracking-normal bg-[#7B9DAE]/5 py-4 pr-4 font-info-content"
            {...props}
        />
    ),
    table: (props) => (
        <div className="overflow-x-auto border border-[#D4A574]/30 my-8 bg-[#1a1a1a]">
            <table className="min-w-full divide-y divide-[#D4A574]/30" {...props} />
        </div>
    ),
    thead: (props) => (
        <thead className="bg-[#D4A574]/10 text-[#D4A574] uppercase text-xs tracking-widest font-mono" {...props} />
    ),
    tbody: (props) => <tbody className="divide-y divide-[#D4A574]/10" {...props} />,
    th: (props) => (
        <th className="px-4 py-3 text-left font-medium text-sm" {...props} />
    ),
    td: (props) => (
        <td className="px-4 py-3 text-sm text-[#D4D4D4] align-top tracking-normal font-info-content" {...props} />
    ),
    code: ({ inline, className, children, ...props }: any) => {
        if (inline) {
            return (
                <code
                    className={clsx(
                        'font-mono text-sm px-1.5 py-0.5 rounded bg-[#7B9DAE]/10 text-[#7B9DAE]',
                        className
                    )}
                    {...props}
                >
                    {children}
                </code>
            );
        }

        return (
            <pre className={clsx('bg-[#000000]/30 border border-[#7B9DAE]/30 p-4 overflow-x-auto text-sm text-[#D4D4D4] my-6 tracking-normal font-mono', className)}>
                <code {...props}>{children}</code>
            </pre>
        );
    }
};

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
