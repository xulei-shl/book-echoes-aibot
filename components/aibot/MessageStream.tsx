'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { UIMessage } from 'ai';
import RetrievalResultDisplay from './RetrievalResultDisplay';
import { useAIBotStore } from '@/store/aibot/useAIBotStore';

interface MessageStreamProps {
    messages: UIMessage[];
    isStreaming: boolean;
}

export default function MessageStream({ messages, isStreaming }: MessageStreamProps) {
    const { retrievalResults } = useAIBotStore(); // 获取检索结果状态

    // 调试日志：检查容器尺寸和滚动状态
    useEffect(() => {
        if (process.env.NODE_ENV === 'development') {
            console.log('[MessageStream DEBUG]', {
                消息数量: messages.length,
                流式状态: isStreaming,
                总内容长度: messages.reduce((sum, msg) => sum + msg.content.length, 0),
                时间戳: new Date().toISOString(),
                检索结果数量: retrievalResults.size
            });
        }
    }, [messages, isStreaming, retrievalResults]);

    return (
        <div
            className="flex-1 overflow-y-auto pr-2 space-y-4 aibot-scroll"
            style={{
                maxHeight: '100%',
                minHeight: '0' // 确保flex子元素可以缩小
            }}
            onLoad={() => {
                if (process.env.NODE_ENV === 'development') {
                    console.log('[MessageStream DEBUG] 容器已加载');
                }
            }}
        >
            <AnimatePresence initial={false}>
                {messages.map((message) => (
                    <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={message.role === 'user' ? 'text-right' : 'text-left'}
                    >
                        {message.role === 'assistant' && (
                            <>
                                {/* 检索结果显示 */}
                                {retrievalResults.get(message.id) && (
                                    <RetrievalResultDisplay
                                        retrievalResult={retrievalResults.get(message.id)!}
                                    />
                                )}
                            </>
                        )}
                        
                        <div
                            className={`inline-block rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap font-info-content ${
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
