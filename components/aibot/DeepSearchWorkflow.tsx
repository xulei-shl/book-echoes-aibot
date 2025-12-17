'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DeepSearchKeywordGenerator from './DeepSearchKeywordGenerator';
import DraftConfirmationDisplay from './DraftConfirmationDisplay';
import DeepSearchBookList from './DeepSearchBookList';
import ProgressLogDisplay, { useProgressLog } from './ProgressLogDisplay';
import type { BookInfo } from '@/src/core/aibot/types';

interface KeywordResult {
    keyword: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
}

type DeepSearchPhase = 'analysis' | 'draft' | 'search' | 'selection' | 'interpretation' | 'completed';

interface DeepSearchWorkflowProps {
    userInput: string;
    onInterpretationGenerated: (interpretation: string) => void;
    onCancel: () => void;
}

export default function DeepSearchWorkflow({
    userInput,
    onInterpretationGenerated,
    onCancel
}: DeepSearchWorkflowProps) {
    const [phase, setPhase] = useState<DeepSearchPhase>('analysis');
    const [keywords, setKeywords] = useState<KeywordResult[]>([]);
    const [draftMarkdown, setDraftMarkdown] = useState('');
    const [searchSnippets, setSearchSnippets] = useState<any[]>([]);
    const [books, setBooks] = useState<BookInfo[]>([]);
    const [selectedBooks, setSelectedBooks] = useState<BookInfo[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showProgress, setShowProgress] = useState(false);
    
    // 使用本地状态管理日志
    const [logs, setLogs] = useState<any[]>([]);
    const [currentPhase, setCurrentPhase] = useState<string>('');
    // 跟踪是否已收到交叉分析完成的进度更新
    const [hasReceivedCrossAnalysisComplete, setHasReceivedCrossAnalysisComplete] = useState(false);
    // 存储最终结果，等待所有进度更新完成后再显示
    const [pendingFinalResult, setPendingFinalResult] = useState<any>(null);

    const addLog = (entry: any) => {
        const newLog = {
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
        
        // 检查是否收到了交叉分析完成的进度更新
        if (entry.phase === 'cross-analysis' && entry.status === 'completed') {
            setHasReceivedCrossAnalysisComplete(true);
            
            // 如果有待处理的最终结果，现在可以处理它了
            if (pendingFinalResult) {
                processFinalResult(pendingFinalResult);
                setPendingFinalResult(null);
            }
        }
    };
    
    // 处理最终结果的函数
    const processFinalResult = (data: any) => {
        setKeywords(data.keywords || []);
        setDraftMarkdown(data.draftMarkdown);
        setSearchSnippets(data.searchSnippets);
        setPhase('draft');  // 进入草稿确认阶段
    };

    // 自动执行深度检索分析（生成关键词、检索、分析、交叉分析）
    useEffect(() => {
        if (userInput && phase === 'analysis') {
            // 自动开始执行流程
            setShowProgress(true);
            executeDeepSearchAnalysis();
        }
    }, [userInput, phase]);

    const executeDeepSearchAnalysis = async () => {
        setPhase('draft');
        setIsLoading(true);
        // 重置进度同步状态
        setHasReceivedCrossAnalysisComplete(false);
        setPendingFinalResult(null);
        
        try {
            // 调用深度检索分析API（SSE流式响应）
            const response = await fetch('/api/local-aibot/deep-search-analysis', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userInput
                })
            });

            if (!response.ok) {
                throw new Error('深度检索分析失败');
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                throw new Error('无法读取响应流');
            }

            let buffer = '';
            
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            
                            if (data.type === 'progress') {
                                // 更新进度日志
                                addLog({
                                    phase: data.phase,
                                    message: data.message,
                                    status: data.status,
                                    details: data.details
                                });
                            } else if (data.type === 'complete') {
                                // 处理最终结果
                                if (data.success) {
                                    // 检查是否已经收到了交叉分析完成的进度更新
                                    if (hasReceivedCrossAnalysisComplete) {
                                        // 如果已经收到，直接处理结果
                                        processFinalResult(data);
                                    } else {
                                        // 如果还没收到，先保存结果，等待进度更新
                                        setPendingFinalResult(data);
                                        
                                        // 设置一个超时，以防进度更新丢失
                                        setTimeout(() => {
                                            if (!hasReceivedCrossAnalysisComplete) {
                                                console.warn('未收到交叉分析完成的进度更新，强制显示草稿');
                                                processFinalResult(data);
                                                setPendingFinalResult(null);
                                            }
                                        }, 2000); // 2秒超时
                                    }
                                } else {
                                    throw new Error(data.message || '深度检索分析失败');
                                }
                            }
                        } catch (parseError) {
                            console.error('解析SSE数据失败:', parseError);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('深度检索分析错误:', error);
            addLog({
                phase: 'error',
                message: '深度检索分析失败',
                status: 'error',
                details: error instanceof Error ? error.message : '未知错误'
            });
        } finally {
            setIsLoading(false);
        }
    };

    // 确认草稿并执行图书检索
    const handleDraftConfirmAndSearch = async () => {
        setIsLoading(true);
        setShowProgress(true);
        
        try {
            // 更新日志：开始图书检索
            addLog({
                phase: 'book-search',
                message: '正在检索相关图书...',
                status: 'running'
            });

            // 调用深度检索API进行图书检索
            const response = await fetch('/api/local-aibot/deep-search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    draftMarkdown,
                    userInput
                })
            });

            if (!response.ok) {
                throw new Error('图书检索失败');
            }

            const data = await response.json();
            
            if (data.success) {
                const bookCount = data.retrievalResult?.books?.length || 0;
                
                // 更新日志：图书检索完成
                addLog({
                    phase: 'book-search',
                    message: `成功检索到 ${bookCount} 本相关图书`,
                    status: 'completed',
                    details: bookCount > 0 ? `已按相关性排序` : '未找到匹配的图书'
                });

                setBooks(data.retrievalResult?.books || []);
                setPhase('selection');  // 修正阶段，应该进入selection而不是search
                
                // 隐藏进度日志，显示图书列表
                setTimeout(() => {
                    setShowProgress(false);
                }, 1500);
            } else {
                throw new Error(data.message || '图书检索失败');
            }
        } catch (error) {
            console.error('图书检索错误:', error);
            addLog({
                phase: 'book-search',
                message: '图书检索失败',
                status: 'error',
                details: error instanceof Error ? error.message : '未知错误'
            });
        } finally {
            setIsLoading(false);
        }
    };

    // 关键词生成完成（保留原有功能作为备选）
    const handleKeywordsGenerated = async (generatedKeywords: KeywordResult[]) => {
        setKeywords(generatedKeywords);
        setPhase('draft');
        setIsLoading(true);
        
        try {
            // 调用深度检索API
            const response = await fetch('/api/local-aibot/deep-search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    keywords: generatedKeywords,
                    userInput
                })
            });

            if (!response.ok) {
                throw new Error('深度检索失败');
            }

            const data = await response.json();
            
            if (data.success) {
                setDraftMarkdown(data.draftMarkdown);
                setSearchSnippets(data.searchSnippets);
                setBooks(data.retrievalResult?.books || []);
                setPhase('search');
            } else {
                throw new Error(data.message || '深度检索失败');
            }
        } catch (error) {
            console.error('深度检索错误:', error);
            // 可以添加错误处理逻辑
        } finally {
            setIsLoading(false);
        }
    };

    // 草稿确认
    const handleDraftConfirm = () => {
        setPhase('selection');
    };

    // 草稿重新生成
    const handleDraftRegenerate = async () => {
        setPhase('analysis');
        setDraftMarkdown('');
        setSearchSnippets([]);
        setBooks([]);
        setSelectedBooks([]);
        // 重置进度同步状态
        setHasReceivedCrossAnalysisComplete(false);
        setPendingFinalResult(null);
    };

    // 草稿取消
    const handleDraftCancel = () => {
        onCancel();
    };

    // 图书选择变化
    const handleBookSelection = (selectedBooks: BookInfo[]) => {
        setSelectedBooks(selectedBooks);
    };

    // 生成深度解读
    const handleGenerateInterpretation = async (selectedBooks: BookInfo[], draftMarkdown: string) => {
        setIsGenerating(true);
        setPhase('interpretation');
        
        try {
            const response = await fetch('/api/local-aibot/deep-interpretation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    selectedBooks,
                    draftMarkdown,
                    originalQuery: userInput
                })
            });

            if (!response.ok) {
                throw new Error('深度解读生成失败');
            }

            const data = await response.json();
            
            if (data.success) {
                onInterpretationGenerated(data.interpretation);
                setPhase('completed');
            } else {
                throw new Error(data.message || '深度解读生成失败');
            }
        } catch (error) {
            console.error('深度解读生成错误:', error);
            setPhase('selection');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* 进度日志显示 */}
            <ProgressLogDisplay
                isVisible={showProgress}
                logs={logs}
                currentPhase={currentPhase}
                onComplete={() => {
                    // 进度完成后的回调
                }}
            />

            {/* 深度检索分析阶段 - 自动执行 */}
            <AnimatePresence>
                {phase === 'analysis' && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3 }}
                        className="flex flex-col items-center justify-center p-8"
                    >
                        <div className="mb-6 text-center">
                            <h3 className="text-[#C9A063] text-lg font-medium mb-2">深度检索</h3>
                            <p className="text-[#E8E6DC] text-sm mb-4">正在自动生成关键词并进行全面检索分析</p>
                            <div className="p-3 bg-[#1B1B1B] rounded border border-[#343434] mb-4">
                                <p className="text-[#A2A09A] text-xs">查询主题</p>
                                <p className="text-[#E8E6DC] text-sm">{userInput}</p>
                            </div>
                        </div>
                        
                        {isLoading && (
                            <div className="flex items-center gap-3">
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#C9A063]"></div>
                                <span className="text-[#C9A063] text-sm">正在执行深度检索分析...</span>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 草稿确认阶段 */}
            <AnimatePresence>
                {phase === 'draft' && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3 }}
                    >
                        <DraftConfirmationDisplay
                            draftMarkdown={draftMarkdown}
                            onDraftChange={setDraftMarkdown}
                            onConfirm={handleDraftConfirmAndSearch}
                            onCancel={handleDraftCancel}
                            onRegenerate={handleDraftRegenerate}
                            isGenerating={isLoading}
                            searchSnippets={searchSnippets}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 图书列表阶段 */}
            <AnimatePresence>
                {phase === 'selection' && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3 }}
                    >
                        <DeepSearchBookList
                            books={books}
                            draftMarkdown={draftMarkdown}
                            onBookSelection={handleBookSelection}
                            onGenerateInterpretation={handleGenerateInterpretation}
                            isLoading={isGenerating}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 生成中状态 */}
            <AnimatePresence>
                {phase === 'interpretation' && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3 }}
                        className="flex flex-col items-center justify-center p-8"
                    >
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C9A063] mb-4"></div>
                        <p className="text-[#E8E6DC] text-sm">正在生成深度解读...</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 流程进度指示器 */}
            <div className="flex items-center justify-center gap-2 py-4">
                {['analysis', 'draft', 'search', 'selection', 'interpretation'].map((p, index) => (
                    <div key={p} className="flex items-center gap-2">
                        <div
                            className={`w-2 h-2 rounded-full ${
                                phase === p ? 'bg-[#C9A063]' :
                                ['analysis', 'draft', 'search', 'selection', 'interpretation'].indexOf(p) <
                                ['analysis', 'draft', 'search', 'selection', 'interpretation'].indexOf(phase)
                                    ? 'bg-[#C9A063]' : 'bg-[#343434]'
                            }`}
                        />
                        {index < 4 && <div className="w-4 h-0.5 bg-[#343434]" />}
                    </div>
                ))}
            </div>
        </div>
    );
}