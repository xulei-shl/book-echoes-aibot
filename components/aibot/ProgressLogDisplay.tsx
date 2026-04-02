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
                                    {logs.filter(l => l.status === 'completed').length} / {Math.max(logs.length, 1)} 完成
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
                                                animate={{
                                                    width: `${(logs.filter(l => l.status === 'completed').length / Math.max(logs.length, 1)) * 100}%`,
                                                    backgroundPosition: ['0% 50%', '100% 50%']
                                                }}
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
                                                                    {PHASE_LABELS[log.phase]}
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
