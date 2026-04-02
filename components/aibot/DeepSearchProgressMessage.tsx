'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DeepSearchLogEntry } from '@/src/core/aibot/types';

// 阶段标签映射
const PHASE_LABELS: Record<string, string> = {
    'keyword': '关键词生成',
    'search': 'MCP检索',
    'analysis': '文章分析',
    'cross-analysis': '交叉分析',
    'book-search': '图书检索',
    'report-generation': '生成解读',
    'completed': '完成',
    'error': '错误'
};

// 阶段图标映射
const PHASE_ICONS: Record<string, string> = {
    'keyword': '🔍',
    'search': '🌐',
    'analysis': '📄',
    'cross-analysis': '🔗',
    'book-search': '📚',
    'report-generation': '📝',
    'completed': '✅',
    'error': '❌'
};

// 预定义的深度检索阶段顺序（用于计算总进度）
const DEEP_SEARCH_PHASES_ORDER = [
    'keyword',
    'search',
    'analysis',
    'cross-analysis',
    'book-search',
    'report-generation'
];

interface DeepSearchProgressMessageProps {
    logs: DeepSearchLogEntry[];
    currentPhase: string;
    title?: string;
}

export default function DeepSearchProgressMessage({
    logs,
    currentPhase,
    title = '深度检索进度'
}: DeepSearchProgressMessageProps) {
    const [isExpanded, setIsExpanded] = useState(true);

    // 计算已完成的阶段数（基于实际日志）
    const completedCount = logs.filter(l => l.status === 'completed').length;
    const totalCount = logs.length > 0 ? logs.length : 1;
    const progressPercent = (completedCount / totalCount) * 100;

    return (
        <div className="mb-4">
            {/* 进度窗口头部 - 可点击折叠 */}
            <motion.div
                className="aibot-workflow-header cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
                whileHover={{ backgroundColor: 'rgba(201, 160, 99, 0.16)' }}
                transition={{ duration: 0.2 }}
            >
                <div className="flex items-center gap-3">
                    <div className="relative flex h-8 w-8 items-center justify-center rounded-full border border-[#C9A063]/24 bg-[#1A1712]">
                        <div className="absolute inset-0 rounded-full bg-[#C9A063]/10 animate-pulse" />
                        <div className="relative h-2 w-2 rounded-full bg-[#C9A063] shadow-[0_0_18px_rgba(201,160,99,0.4)]"></div>
                    </div>
                    <div>
                        <span className="block font-info-content text-sm font-medium text-[#F0E4D0]">
                            {title}
                        </span>
                        <div className="text-xs text-[#AFA79A] font-info-content">
                            {completedCount} / {totalCount} 完成
                        </div>
                    </div>
                </div>
                <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-[#A2A09A]"
                >
                    ▼
                </motion.div>
            </motion.div>

            {/* 进度窗口内容 */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                    >
                        <div className="aibot-workflow-card rounded-t-none border-t-0">
                            {/* 进度条 */}
                            <div className="px-4 pt-4 pb-3 md:px-5">
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#100F0D]">
                                    <motion.div
                                        className="h-full rounded-full bg-[linear-gradient(90deg,#C9A063,#E4CC9F,#C9A063)] bg-[length:200%_100%]"
                                        initial={{ width: 0, backgroundPosition: '0% 50%' }}
                                        animate={{ width: `${progressPercent}%`, backgroundPosition: ['0% 50%', '100% 50%'] }}
                                        transition={{ width: { duration: 0.5 }, backgroundPosition: { duration: 1.8, repeat: Infinity, ease: 'linear' } }}
                                    />
                                </div>
                            </div>

                            {/* 日志列表 */}
                            <div className="px-4 pb-4 md:px-5 md:pb-5">
                                <div className="aibot-scroll space-y-2.5 max-h-40 overflow-y-auto pr-1">
                                    {logs.map((log) => (
                                        <motion.div
                                            key={log.id}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className={`rounded-2xl border px-3 py-3 md:px-4 ${
                                                log.status === 'error' ? 'border-red-400/18 bg-red-400/8' :
                                                log.status === 'running' ? 'border-[#C9A063]/26 bg-[#C9A063]/10 shadow-[0_0_0_1px_rgba(201,160,99,0.04)]' :
                                                log.status === 'completed' ? 'border-emerald-400/18 bg-emerald-400/8' :
                                                'border-[#E8E6DC]/8 bg-[#151412]'
                                            }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="mt-0.5 flex-shrink-0">
                                                    {log.status === 'running' ? (
                                                        <div className="h-3.5 w-3.5 rounded-full border border-[#C9A063] border-t-transparent animate-spin"></div>
                                                    ) : log.status === 'error' ? (
                                                        <span className="text-red-300">●</span>
                                                    ) : log.status === 'completed' ? (
                                                        <span className="text-emerald-300">●</span>
                                                    ) : (
                                                        <span className="text-[#8E8679]">○</span>
                                                    )}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <div className="mb-1 flex items-center gap-2">
                                                        <span className="font-info-content text-sm text-[#ECE4D7]">
                                                            {PHASE_LABELS[log.phase] || log.phase}
                                                        </span>
                                                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8E8679]">
                                                            {log.timestamp}
                                                        </span>
                                                    </div>

                                                    <p className={`font-info-content text-sm leading-6 ${
                                                        log.status === 'error' ? 'text-red-200' :
                                                        log.status === 'running' ? 'text-[#F0DEC0]' :
                                                        log.status === 'completed' ? 'text-emerald-200' :
                                                        'text-[#B8B0A3]'
                                                    }`}>
                                                        {log.message}
                                                    </p>

                                                    {log.details && (
                                                        <p className="mt-1 text-xs leading-5 text-[#7E776C] font-info-content">
                                                            {log.details}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
