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
                className="flex items-center justify-between p-3 border border-[#C9A063]/30 bg-[#1a1a1a]/90 backdrop-blur-xl cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
                whileHover={{ backgroundColor: 'rgba(26, 26, 26, 0.95)' }}
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
                        <div className="border border-[#C9A063]/30 border-t-0 bg-[#1a1a1a]/90 backdrop-blur-xl">
                            {/* 进度条 */}
                            <div className="p-4 pb-3">
                                <div className="w-full bg-[#1B1B1B] h-1 rounded-full">
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
                                <div className="space-y-2 max-h-48 overflow-y-auto about-overlay-scroll">
                                    {logs.map((log) => {
                                        const isRunning = log.status === 'running';

                                        return (
                                            <motion.div
                                                key={log.id}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={
                                                    isRunning
                                                        ? {
                                                              opacity: [0.9, 1, 0.9],
                                                              borderColor: [
                                                                  'rgba(201,160,99,0.22)',
                                                                  'rgba(201,160,99,0.45)',
                                                                  'rgba(201,160,99,0.22)'
                                                              ],
                                                              backgroundColor: [
                                                                  'rgba(201,160,99,0.03)',
                                                                  'rgba(201,160,99,0.08)',
                                                                  'rgba(201,160,99,0.03)'
                                                              ]
                                                          }
                                                        : { opacity: 1, x: 0 }
                                                }
                                                transition={
                                                    isRunning
                                                        ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
                                                        : { duration: 0.2 }
                                                }
                                                className={`relative overflow-hidden p-3 border ${
                                                    log.status === 'error'
                                                        ? 'border-red-500/30 bg-red-500/5'
                                                        : log.status === 'running'
                                                          ? 'border-[#C9A063]/30 bg-[#C9A063]/5'
                                                          : log.status === 'completed'
                                                            ? 'border-[#C9A063]/28 bg-[#C9A063]/8'
                                                            : 'border-[#C9A063]/15 bg-[#111111]/80'
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
                                                            <span
                                                                className="text-sm font-medium font-info-content"
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
                                                                <span className="text-xs font-mono tracking-wider text-[#A2A09A]">
                                                                    {log.timestamp}
                                                                </span>
                                                            )}
                                                            {isRunning && (
                                                                <motion.span
                                                                    className="text-[10px] font-mono tracking-[0.24em] text-[#C9A063]"
                                                                    animate={{ opacity: [0.55, 1, 0.55] }}
                                                                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                                                                >
                                                                    RUNNING
                                                                </motion.span>
                                                            )}
                                                        </div>

                                                        <p
                                                            className="text-sm font-medium font-info-content"
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
                                                            <p className="text-xs mt-1 font-info-content text-[#A2A09A]">
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
