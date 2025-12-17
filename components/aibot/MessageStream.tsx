'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { Message } from 'ai';

interface MessageStreamProps {
    messages: Message[];
    isStreaming: boolean;
}

export default function MessageStream({ messages, isStreaming }: MessageStreamProps) {
    return (
        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            <AnimatePresence initial={false}>
                {messages.map((message) => (
                    <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={message.role === 'user' ? 'text-right' : 'text-left'}
                    >
                        <div
                            className={`inline-block rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                                message.role === 'user'
                                    ? 'bg-[#2F2F2F] text-[#E8E6DC]'
                                    : 'bg-[#1B1B1B] border border-[#343434] text-[#E8E6DC]'
                            }`}
                        >
                            {message.content}
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
            {isStreaming && (
                <div className="text-left text-xs text-[#A2A09A] animate-pulse">
                    正在生成中，请稍候...
                </div>
            )}
        </div>
    );
}
