'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ProgressLogEntry {
    id: string;
    timestamp: string;
    phase: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    message: string;
    details?: string;
}

export interface ProgressLogInput {
    id?: string;
    timestamp?: string;
    phase?: string;
    status?: 'pending' | 'running' | 'completed' | 'error';
    message?: string;
    details?: string;
}

const PHASE_LABELS: Record<string, string> = {
    // 深度检索阶段
    keyword: '关键词生成',
    search: '网络检索',
    analysis: '文章分析',
    'cross-analysis': '交叉分析',
    'book-search': '图书检索',
    'report-generation': '报告生成',
    // 文档分析阶段
    'document-analysis': '文档分析',
    // 简单检索阶段
    classify: '问题分类',
    expand: '检索扩展',
    'parallel-search': '并行检索',
    merge: '结果合并',
    // 通用阶段
    completed: '完成',
    error: '错误'
};

const PHASE_ICONS: Record<string, string> = {
    // 深度检索阶段
    keyword: '🔍',
    search: '🌐',
    analysis: '📄',
    'cross-analysis': '🔗',
    'book-search': '📚',
    'report-generation': '📝',
    // 文档分析阶段
    'document-analysis': '📄',
    // 简单检索阶段
    classify: '🏷️',
    expand: '🔀',
    'parallel-search': '⚡',
    merge: '📊',
    // 通用阶段
    completed: '✅',
    error: '❌'
};

const EMPTY_LOGS: ProgressLogInput[] = [];

export interface UnifiedProgressMessageProps {
    logs?: ProgressLogInput[];
    title?: string;
    isVisible?: boolean;
    currentPhase?: string;
}

export default function UnifiedProgressMessage({
    logs: externalLogs = EMPTY_LOGS,
    title = '检索进度',
    isVisible = true
}: UnifiedProgressMessageProps) {
    const [isExpanded, setIsExpanded] = useState(true);

    const logs: ProgressLogEntry[] = useMemo(
        () =>
            externalLogs.map((log, index) => ({
                id: log.id || `${log.phase ?? 'log'}-${index}`,
                timestamp: log.timestamp || '',
                phase: log.phase || 'search',
                status: log.status ?? 'pending',
                message: log.message ?? '',
                details: log.details
            })),
        [externalLogs]
    );

    if (!isVisible || logs.length === 0) {
        return null;
    }

    const completedCount = logs.filter((l) => l.status === 'completed').length;
    const totalCount = logs.length > 0 ? logs.length : 1;
    const progressPercent = (completedCount / totalCount) * 100;

    return (
        <div className="mb-4">
            {/* 进度头部 - 可折叠 */}
            <motion.div
                className="flex items-center justify-between p-3 border border-[#C9A063]/30 bg-[#1a1a1a]/90 backdrop-blur-xl cursor-pointer gap-2.5 flex-wrap"
                onClick={() => setIsExpanded(!isExpanded)}
                whileHover={{ backgroundColor: 'rgba(26, 26, 26, 0.95)' }}
                transition={{ duration: 0.2 }}
            >
                <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                    <div className="animate-pulse shrink-0">
                        <div className="w-2 h-2 bg-[#C9A063] rounded-full"></div>
                    </div>
                    <span className="text-[#C9A063] text-sm font-medium font-mono tracking-wider shrink-0 whitespace-nowrap">
                        {title}
                    </span>
                    <div className="text-xs text-[#A2A09A] font-mono tracking-wider tabular-nums shrink-0 whitespace-nowrap">
                        {completedCount} / {totalCount} 完成
                    </div>
                </div>
                <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="text-[#A2A09A] shrink-0"
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
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="overflow-hidden"
                    >
                        <div className="border border-[#C9A063]/25 border-t-0 bg-[#161514]/90 backdrop-blur-xl">
                            {/* 进度条 (GPU 加速 scaleX 代替 width) */}
                            <div className="p-3.5 pb-2.5">
                                <div className="w-full bg-[#201e1c] h-1 rounded-full overflow-hidden">
                                    <motion.div
                                        className="bg-[#C9A063] h-1 w-full rounded-full"
                                        style={{ transformOrigin: 'left' }}
                                        initial={{ scaleX: 0 }}
                                        animate={{ scaleX: Math.max(0, Math.min(1, progressPercent / 100)) }}
                                        transition={{ duration: 0.35, ease: 'easeOut' }}
                                    />
                                </div>
                            </div>

                            {/* 日志列表 */}
                            <div className="px-3.5 pb-3.5">
                                <div className="space-y-1.5 max-h-48 overflow-y-auto about-overlay-scroll">
                                    {logs.map((log) => {
                                        const isRunning = log.status === 'running';

                                        return (
                                            <div
                                                key={log.id}
                                                className={`relative overflow-hidden p-2.5 border transition-colors duration-150 ${
                                                    log.status === 'error'
                                                        ? 'border-red-500/30 bg-red-500/5'
                                                        : log.status === 'running'
                                                          ? 'border-[#C9A063]/40 bg-[#C9A063]/10'
                                                          : log.status === 'completed'
                                                            ? 'border-[#C9A063]/20 bg-[#C9A063]/5'
                                                            : 'border-[#C9A063]/10 bg-[#111110]/60'
                                                }`}
                                            >
                                                <div className="flex items-start gap-2.5">
                                                    <div className="flex-shrink-0 mt-0.5">
                                                        {isRunning ? (
                                                            <div className="relative flex h-3 w-3 items-center justify-center">
                                                                <span className="relative inline-flex h-2.5 w-2.5 animate-spin rounded-full border border-[#C9A063]/30 border-t-[#C9A063]"></span>
                                                            </div>
                                                        ) : log.status === 'error' ? (
                                                            <span className="text-red-400 text-xs">❌</span>
                                                        ) : log.status === 'completed' ? (
                                                            <span className="text-[#C9A063] text-xs font-mono">✓</span>
                                                        ) : (
                                                            <span className="text-[#A2A09A] text-xs">○</span>
                                                        )}
                                                    </div>

                                                    <div className="relative z-10 flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                                            <span
                                                                className="text-xs font-medium font-info-content shrink-0 whitespace-nowrap"
                                                                style={{
                                                                    color:
                                                                        log.status === 'error'
                                                                            ? '#ef4444'
                                                                            : log.status === 'completed' || log.status === 'running'
                                                                              ? '#C9A063'
                                                                              : '#E8E6DC'
                                                                }}
                                                            >
                                                                {PHASE_ICONS[log.phase] || '📋'} {PHASE_LABELS[log.phase] || log.phase}
                                                            </span>
                                                            {log.timestamp && (
                                                                <span className="text-[11px] font-mono tabular-nums tracking-wider text-[#A2A09A] shrink-0 whitespace-nowrap">
                                                                    {log.timestamp}
                                                                </span>
                                                            )}
                                                            {isRunning && (
                                                                <span className="text-[9px] font-mono tracking-widest text-[#C9A063] shrink-0 whitespace-nowrap animate-pulse">
                                                                    RUNNING
                                                                </span>
                                                            )}
                                                        </div>

                                                        <p
                                                            className="text-xs font-info-content leading-relaxed"
                                                            style={{
                                                                color:
                                                                    log.status === 'error'
                                                                        ? '#fca5a5'
                                                                        : log.status === 'running' || log.status === 'completed'
                                                                          ? '#E8E6DC'
                                                                          : '#A2A09A'
                                                                }}
                                                        >
                                                            {log.message}
                                                        </p>

                                                        {log.details && (
                                                            <p className="text-[11px] mt-0.5 font-info-content text-[#A2A09A] leading-relaxed">
                                                                {log.details}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
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
