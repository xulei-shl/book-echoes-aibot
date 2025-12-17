'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LogEntry {
    id: string;
    timestamp: string;
    phase: 'keyword' | 'search' | 'analysis' | 'cross-analysis' | 'book-search' | 'completed' | 'error';
    message: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    details?: string;
}

interface ProgressLogDisplayProps {
    isVisible: boolean;
    logs?: any[];
    currentPhase?: string;
    onComplete?: () => void;
}

const PHASE_LABELS = {
    'keyword': '关键词生成',
    'search': 'MCP检索',
    'analysis': '文章分析',
    'cross-analysis': '交叉分析',
    'book-search': '图书检索',
    'completed': '完成',
    'error': '错误'
};

const PHASE_ICONS = {
    'keyword': '🔍',
    'search': '🌐',
    'analysis': '📄',
    'cross-analysis': '🔗',
    'book-search': '📚',
    'completed': '✅',
    'error': '❌'
};

export default function ProgressLogDisplay({
    isVisible,
    logs: externalLogs = [],
    currentPhase: externalCurrentPhase = '',
    onComplete
}: ProgressLogDisplayProps) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [currentPhase, setCurrentPhase] = useState<string>('');

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
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="mb-4"
                >
                    <div className="p-4 rounded-xl border border-[#343434] bg-[rgba(26,26,26,0.8)]">
                        {/* 头部 */}
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <div className="animate-pulse">
                                    <div className="w-2 h-2 bg-[#C9A063] rounded-full"></div>
                                </div>
                                <span className="text-[#C9A063] text-sm font-medium">
                                    深度检索进度
                                </span>
                            </div>
                            <div className="text-xs text-[#A2A09A]">
                                {logs.filter(l => l.status === 'completed').length} / {Math.max(logs.length, 1)} 完成
                            </div>
                        </div>

                        {/* 进度条 */}
                        <div className="mb-4">
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
                        <div className="space-y-2 max-h-32 overflow-y-auto about-overlay-scroll">
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
                                                <span className="text-sm">
                                                    {PHASE_ICONS[log.phase]} {PHASE_LABELS[log.phase]}
                                                </span>
                                                <span className="text-xs text-[#A2A09A]">
                                                    {log.timestamp}
                                                </span>
                                            </div>
                                            
                                            <p className={`text-sm ${
                                                log.status === 'error' ? 'text-red-400' :
                                                log.status === 'running' ? 'text-[#C9A063]' :
                                                log.status === 'completed' ? 'text-green-400' :
                                                'text-[#A2A09A]'
                                            }`}>
                                                {log.message}
                                            </p>
                                            
                                            {log.details && (
                                                <p className="text-xs text-[#6F6D68] mt-1">
                                                    {log.details}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </motion.div>
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