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

    // 计算已完成的阶段数（基于预定义阶段列表）
    const completedPhases = new Set(
        logs.filter(l => l.status === 'completed').map(l => l.phase)
    );
    const completedCount = DEEP_SEARCH_PHASES_ORDER.filter(phase => completedPhases.has(phase)).length;
    const totalCount = DEEP_SEARCH_PHASES_ORDER.length;
    const progressPercent = (completedCount / totalCount) * 100;

    return (
        <div className="mb-4">
            {/* 进度窗口头部 - 可点击折叠 */}
            <motion.div
                className="flex items-center justify-between p-3 rounded-t-xl border border-[#343434] bg-[rgba(26,26,26,0.8)] cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
                whileHover={{ backgroundColor: 'rgba(201, 160, 99, 0.1)' }}
                transition={{ duration: 0.2 }}
            >
                <div className="flex items-center gap-3">
                    <div className="animate-pulse">
                        <div className="w-2 h-2 bg-[#C9A063] rounded-full"></div>
                    </div>
                    <span className="text-[#C9A063] text-sm font-medium font-body">
                        {title}
                    </span>
                    <div className="text-xs text-[#A2A09A] font-body">
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
                        <div className="border border-[#343434] border-t-0 rounded-b-xl bg-[rgba(26,26,26,0.8)]">
                            {/* 进度条 */}
                            <div className="p-4 pb-3">
                                <div className="w-full bg-[#1B1B1B] rounded-full h-1">
                                    <motion.div
                                        className="bg-[#C9A063] h-1 rounded-full"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progressPercent}%` }}
                                        transition={{ duration: 0.5 }}
                                    />
                                </div>
                            </div>

                            {/* 日志列表 */}
                            <div className="px-4 pb-4">
                                <div className="space-y-2 max-h-48 overflow-y-auto aibot-scroll">
                                    {logs.map((log) => (
                                        <motion.div
                                            key={log.id}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className={`p-3 rounded-lg border ${
                                                log.status === 'error' ? 'border-red-500/30 bg-red-500/5' :
                                                log.status === 'running' ? 'border-[#C9A063]/30 bg-[#C9A063]/5' :
                                                log.status === 'completed' ? 'border-green-500/30 bg-green-500/5' :
                                                'border-[#343434] bg-[#1B1B1B]'
                                            }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="flex-shrink-0 mt-0.5">
                                                    {log.status === 'running' ? (
                                                        <div className="animate-spin rounded-full w-3 h-3 border-b border-[#C9A063]"></div>
                                                    ) : log.status === 'error' ? (
                                                        <span className="text-red-400">❌</span>
                                                    ) : log.status === 'completed' ? (
                                                        <span className="text-green-400">✓</span>
                                                    ) : (
                                                        <span className="text-[#A2A09A]">○</span>
                                                    )}
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-sm font-body">
                                                            {PHASE_ICONS[log.phase] || '📋'} {PHASE_LABELS[log.phase] || log.phase}
                                                        </span>
                                                        <span className="text-xs text-[#A2A09A] font-body">
                                                            {log.timestamp}
                                                        </span>
                                                    </div>

                                                    <p className={`text-sm font-body ${
                                                        log.status === 'error' ? 'text-red-400' :
                                                        log.status === 'running' ? 'text-[#C9A063]' :
                                                        log.status === 'completed' ? 'text-green-400' :
                                                        'text-[#A2A09A]'
                                                    }`}>
                                                        {log.message}
                                                    </p>

                                                    {log.details && (
                                                        <p className="text-xs text-[#6F6D68] mt-1 font-body">
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
