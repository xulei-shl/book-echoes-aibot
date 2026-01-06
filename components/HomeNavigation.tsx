'use client';

import { useState } from 'react';
import Link from 'next/link';
import AboutOverlay from './AboutOverlay';
import { motion } from 'framer-motion';
import AIBotLauncher from '@/components/aibot/AIBotLauncher';
import AIBotOverlay from '@/components/aibot/AIBotOverlay';

interface HomeNavigationProps {
    aboutContent: string;
}

export default function HomeNavigation({ aboutContent }: HomeNavigationProps) {
    const [isAboutOpen, setIsAboutOpen] = useState(false);
    const enableLocalAIBot = process.env.NEXT_PUBLIC_ENABLE_AIBOT_LOCAL === '1';

    return (
        <>
            <motion.div
                className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-4 drop-shadow-lg pointer-events-auto"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1, duration: 0.8 }}
                onClick={(e) => e.stopPropagation()} // 阻止事件冒泡到 HomeHero
            >
                <Link
                    href="/archive"
                    className="font-display text-lg md:text-xl text-[#E8E6DC] hover:text-[#D4A574] hover:drop-shadow-[0_0_12px_rgba(212,165,116,0.6)] transition-all duration-300 hover:scale-105"
                >
                    往期回顾
                </Link>

                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsAboutOpen(true);
                    }}
                    className="font-display text-lg md:text-xl text-[#E8E6DC] hover:text-[#D4A574] hover:drop-shadow-[0_0_12px_rgba(212,165,116,0.6)] transition-all duration-300 hover:scale-105 cursor-pointer"
                >
                    关于
                </button>

                {enableLocalAIBot && <AIBotLauncher />}

                <div className="mt-4 text-right">
                    <p className="font-body text-xs text-[#E8E6DC]/80">
                        书海回响 — 那些被悄悄归还的一本好书
                    </p>
                    <p className="font-body text-xs text-[#E8E6DC]/80">
                        @ XXX 图书馆
                    </p>
                </div>
            </motion.div>

            <AboutOverlay
                content={aboutContent}
                isOpen={isAboutOpen}
                onClose={() => setIsAboutOpen(false)}
            />

            {/* AIBotOverlay 放在最外层，避免受到 motion.div 的 transform 影响 */}
            {enableLocalAIBot && <AIBotOverlay />}
        </>
    );
}
