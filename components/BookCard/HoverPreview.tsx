'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

const PREVIEW_WIDTH = 480;
const PREVIEW_HEIGHT = 680;

interface HoverPreviewProps {
    isVisible: boolean;
    position: { x: number; y: number };
    imageSrc: string;
    alt: string;
}

export default function HoverPreview({ isVisible, position, imageSrc, alt }: HoverPreviewProps) {
    if (!isVisible) return null;

    return (
        <motion.div
            className="pointer-events-none fixed z-[200] drop-shadow-2xl"
            style={{ left: position.x, top: position.y }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
        >
            <div
                className="rounded-2xl border border-white/10 bg-[#1a1a1a]/95 p-3 backdrop-blur"
                style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
            >
                <Image
                    src={imageSrc}
                    alt={alt}
                    fill
                    sizes="480px"
                    className="object-contain rounded-xl bg-black/20"
                    priority={false}
                    loading="lazy"
                />
            </div>
        </motion.div>
    );
}
