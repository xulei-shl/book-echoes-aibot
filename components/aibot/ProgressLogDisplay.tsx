'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// 深度检索阶段
type DeepSearchPhase = 'keyword' | 'search' | 'analysis' | 'cross-analysis' | 'book-search';
// 简单检索阶段
type SimpleSearchPhase = 'classify' | 'expand' | 'parallel-search' | 'merge';
// 文档分析阶段
type DocumentAnalysisPhaseType = 'document-analysis' | 'report-generation';
// 通用阶段
type CommonPhase = 'completed' | 'error';
// 所有阶段类型
export type SearchPhase = DeepSearchPhase | SimpleSearchPhase | DocumentAnalysisPhaseType | CommonPhase;

export interface LogEntry {
    id: string;
    timestamp: string;
    phase: SearchPhase;
    message: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    details?: string;
}

interface ProgressLogDisplayProps {
    isVisible: boolean;
    logs?: any[];
    currentPhase?: string;
    onComplete?: () => void;
    title?: string; // 支持自定义标题
}

const PHASE_LABELS: Record<SearchPhase, string> = {
    // 深度检索阶段
    'keyword': '关键词生成',
    'search': 'MCP检索',
    'analysis': '文章分析',
    'cross-analysis': '交叉分析',
    'book-search': '图书检索',
    // 文档分析阶段
    'document-analysis': '文档分析',
    'report-generation': '报告生成',
    // 简单检索阶段
    'classify': '问题分类',
    'expand': '检索扩展',
    'parallel-search': '并行检索',
    'merge': '结果合并',
    // 通用阶段
    'completed': '完成',
    'error': '错误'
};

const PHASE_ICONS: Record<SearchPhase, string> = {
    // 深度检索阶段
    'keyword': '🔍',
    'search': '🌐',
    'analysis': '📄',
    'cross-analysis': '🔗',
    'book-search': '📚',
    // 文档分析阶段
    'document-analysis': '📄',
    'report-generation': '📝',
    // 简单检索阶段
    'classify': '🏷️',
    'expand': '🔀',
    'parallel-search': '⚡',
    'merge': '📊',
    // 通用阶段
    'completed': '✅',
    'error': '❌'
};

export default function ProgressLogDisplay({
    isVisible,
    logs: externalLogs = [],
    currentPhase: externalCurrentPhase = '',
    onComplete,
    title = '检索进度'
}: ProgressLogDisplayProps) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [currentPhase, setCurrentPhase] = useState<string>('');
    const [isExpanded, setIsExpanded] = useState(true);

    // 添加日志条目
    const addLog = (entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
        const newLog: LogEntry = {
            ...entry,
            id: `${Date.now()}-${Math.random()}`,
            timestamp: new Date().toLocaleTimeString('zh-CN')
        };
        
        setLogs(prev => {
            const existingIndex = prev.findIndex(log => log.phase === entry.phase);
            if (existingIndex >= 0) {
                const updated = [...prev];
                updated[existingIndex] = newLog;
                return updated;
            }
            return [...prev, newLog];
        });
        
        setCurrentPhase(entry.phase);
        
        if (entry.phase === 'completed' && entry.status === 'completed') {
            setTimeout(() => {
                onComplete?.();
            }, 1000);
        }
    };

    // 清空日志
    const clearLogs = () => {
        setLogs([]);
        setCurrentPhase('');
    };

    // 监听可见性变化和外部logs变化
    useEffect(() => {
        if (isVisible) {
            clearLogs();
        }
    }, [isVisible]);

    // 同步外部logs
    useEffect(() => {
        if (externalLogs.length > 0) {
            setLogs(externalLogs.map(log => ({
                ...log,
                id: log.id || `${Date.now()}-${Math.random()}`,
                timestamp: log.timestamp || new Date().toLocaleTimeString('zh-CN')
            })));
        }
    }, [externalLogs]);

    // 同步外部currentPhase
    useEffect(() => {
        if (externalCurrentPhase) {
            setCurrentPhase(externalCurrentPhase);
        }
    }, [externalCurrentPhase]);

    return (
        <AnimatePresence>
            {isVisible && (
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
                            <span className="text-[#C9A063] text-sm font-medium">
                                {title}
                            </span>
                            <div className="text-xs text-[#A2A09A]">
                                {logs.filter(l => l.status === 'completed').length} / {Math.max(logs.length, 1)} 完成
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
                                        <div className="w-full bg-[#1B1B1B] rounded-full h-1">
                                            <motion.div
                                                className="bg-[#C9A063] h-1 rounded-full"
                                                initial={{ width: 0 }}
                                                animate={{
                                                    width: `${(logs.filter(l => l.status === 'completed').length / Math.max(logs.length, 1)) * 100}%`
                                                }}
                                                transition={{ duration: 0.5 }}
                                            />
                                        </div>
                                    </div>

                                    {/* 日志列表 */}
                                    <div className="px-4 pb-4">
                                        <div className="space-y-2 max-h-23 overflow-y-auto about-overlay-scroll">
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
                                                        className={`relative overflow-hidden p-3 border ${
                                                            log.status === 'error' ? 'border-red-500/30 bg-red-500/5' :
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
                                                                    <span className="text-sm font-medium font-info-content" style={{ color: log.status === 'error' ? '#FFE2E2' : log.status === 'completed' || log.status === 'running' ? '#FFF4DD' : '#FFF8EB' }}>
                                                                        {PHASE_ICONS[log.phase]} {PHASE_LABELS[log.phase]}
                                                                    </span>
                                                                    <span className="text-xs font-mono tracking-wider" style={{ color: '#F2DEC2' }}>
                                                                        {log.timestamp}
                                                                    </span>
                                                                    {isRunning && (
                                                                        <motion.span
                                                                            className="text-[10px] font-mono tracking-[0.24em]"
                                                                            style={{ color: '#FFE7B8' }}
                                                                            animate={{ opacity: [0.55, 1, 0.55] }}
                                                                            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                                                                        >
                                                                            RUNNING
                                                                        </motion.span>
                                                                    )}
                                                                </div>

                                                                <p className="text-sm font-medium font-info-content" style={{ color: log.status === 'error' ? '#FFF1F2' : log.status === 'running' || log.status === 'completed' ? '#FFF8EB' : '#F7F3EA' }}>
                                                                    {log.message}
                                                                </p>

                                                                {log.details && (
                                                                    <p className="text-xs mt-1 font-info-content" style={{ color: '#EADCC5' }}>
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
            )}
        </AnimatePresence>
    );
}

// 创建全局日志状态
let globalLogUpdater: ((entry: Omit<LogEntry, 'id' | 'timestamp'>) => void) | null = null;

// 导出日志更新函数，供外部组件调用
export function useProgressLog() {
    const registerLogUpdater = (updater: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void) => {
        globalLogUpdater = updater;
        return updater;
    };

    return {
        registerLogUpdater,
        updateLog: globalLogUpdater
    };
}
