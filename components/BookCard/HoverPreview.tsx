'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import Image from 'next/image';

export const PREVIEW_WIDTH = 320;
export const PREVIEW_HEIGHT = 460;

interface HoverPreviewProps {
    isVisible: boolean;
    position: { x: number; y: number };
    imageSrc: string;
    alt: string;
}

export default function HoverPreview({ isVisible, position, imageSrc, alt }: HoverPreviewProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // 尚未在客户端挂载或不可见时不渲染
    if (!isVisible || !mounted) return null;

    return createPortal(
        <motion.div
            className="pointer-events-none fixed z-[9999] drop-shadow-2xl"
            style={{ left: position.x, top: position.y }}
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
        >
            <div
                className="relative rounded-2xl border border-white/20 bg-[#1a1a1a]/95 p-2 shadow-[0_25px_60px_rgba(0,0,0,0.75)] backdrop-blur-md"
                style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
            >
                <div className="relative w-full h-full rounded-xl overflow-hidden bg-black/40">
                    <Image
                        src={imageSrc}
                        alt={alt}
                        fill
                        sizes="320px"
                        className="object-contain rounded-xl pointer-events-none"
                        priority={false}
                        loading="lazy"
                    />
                </div>
                {/* 底部微型指示箭头，明确指示对应的书签名 */}
                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#1a1a1a] border-r border-b border-white/20 rotate-45 pointer-events-none" />
            </div>
        </motion.div>,
        document.body
    );
}
