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
                className="flex items-center justify-between p-3 border border-[#C9A063]/20 bg-[rgba(26,26,26,0.8)] cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
                whileHover={{ backgroundColor: 'rgba(201, 160, 99, 0.1)' }}
                transition={{ duration: 0.2 }}
            >
                <div className="flex items-center gap-3">
                    <div className="animate-pulse">
                        <div className="w-2 h-2 bg-[#C9A063] rounded-full"></div>
                    </div>
                    <span className="text-[#C9A063] text-sm font-medium font-mono tracking-wider">
                        {title}
                    </span>
                    <div className="text-xs text-[#A2A09A] font-mono tracking-wider">
                        {completedCount} / {totalCount} 完成
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
                        <div className="border border-[#C9A063]/20 border-t-0 bg-[rgba(26,26,26,0.8)]">
                            {/* 进度条 */}
                            <div className="p-4 pb-3">
                                <div className="w-full bg-[#1B1B1B] h-1">
                                    <motion.div
                                        className="bg-[#C9A063] h-1"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progressPercent}%` }}
                                        transition={{ duration: 0.5 }}
                                    />
                                </div>
                            </div>

                            {/* 日志列表 */}
                            <div className="px-4 pb-4">
                                <div className="space-y-2 max-h-24 overflow-y-auto about-overlay-scroll">
                                    {logs.map((log) => {
                                        const isRunning = log.status === 'running';

                                        return (
                                            <motion.div
                                                key={log.id}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={isRunning ? {
                                                    opacity: [0.9, 1, 0.9],
                                                    borderColor: ['rgba(201,160,99,0.22)', 'rgba(201,160,99,0.45)', 'rgba(201,160,99,0.22)'],
                                                    backgroundColor: ['rgba(201,160,99,0.03)', 'rgba(201,160,99,0.08)', 'rgba(201,160,99,0.03)']
                                                } : { opacity: 1, x: 0 }}
                                                transition={isRunning ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
                                                className={`relative overflow-hidden p-3 border ${log.status === 'error' ? 'border-red-500/30 bg-red-500/5' :
                                                        log.status === 'running' ? 'border-[#C9A063]/30 bg-[#C9A063]/5' :
                                                            log.status === 'completed' ? 'border-[#C9A063]/28 bg-[#C9A063]/8' :
                                                                'border-[#C9A063]/15 bg-[#111111]/80'
                                                    }`}
                                            >
                                                {isRunning && (
                                                    <motion.div
                                                        aria-hidden="true"
                                                        className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-transparent via-[#C9A063]/12 to-transparent"
                                                        initial={{ x: '-120%' }}
                                                        animate={{ x: '420%' }}
                                                        transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
                                                    />
                                                )}

                                                <div className="flex items-start gap-3">
                                                    <div className="flex-shrink-0 mt-0.5">
                                                        {isRunning ? (
                                                            <div className="relative flex h-3 w-3 items-center justify-center">
                                                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#C9A063]/35"></span>
                                                                <span className="relative inline-flex h-2.5 w-2.5 animate-spin rounded-full border border-[#C9A063]/25 border-t-[#C9A063]"></span>
                                                            </div>
                                                        ) : log.status === 'error' ? (
                                                            <span className="text-red-400">❌</span>
                                                        ) : log.status === 'completed' ? (
                                                            <span className="text-[#E6C98B]">✓</span>
                                                        ) : (
                                                            <span className="text-[#A2A09A]">○</span>
                                                        )}
                                                    </div>

                                                    <div className="relative z-10 flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-sm font-medium font-info-content" style={{ color: log.status === 'error' ? '#ef4444' : log.status === 'completed' || log.status === 'running' ? '#C9A063' : '#E8E6DC' }}>
                                                                {PHASE_ICONS[log.phase] || '📋'} {PHASE_LABELS[log.phase] || log.phase}
                                                            </span>
                                                            <span className="text-xs font-mono tracking-wider" style={{ color: '#A2A09A' }}>
                                                                {log.timestamp}
                                                            </span>
                                                            {isRunning && (
                                                                <motion.span
                                                                    className="text-[10px] font-mono tracking-[0.24em]"
                                                                    style={{ color: '#C9A063' }}
                                                                    animate={{ opacity: [0.55, 1, 0.55] }}
                                                                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                                                                >
                                                                    RUNNING
                                                                </motion.span>
                                                            )}
                                                        </div>

                                                        <p className="text-sm font-medium font-info-content" style={{ color: log.status === 'error' ? '#fca5a5' : log.status === 'running' || log.status === 'completed' ? '#E8E6DC' : '#A2A09A' }}>
                                                            {log.message}
                                                        </p>

                                                        {log.details && (
                                                            <p className="text-xs mt-1 font-info-content" style={{ color: '#A2A09A' }}>
                                                                {log.details}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
