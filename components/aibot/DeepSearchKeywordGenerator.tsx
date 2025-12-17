'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface KeywordResult {
    keyword: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
}

interface DeepSearchKeywordGeneratorProps {
    userInput: string;
    onKeywordsGenerated: (keywords: KeywordResult[]) => void;
    isGenerating: boolean;
    onGeneratingChange?: (generating: boolean) => void;
}

export default function DeepSearchKeywordGenerator({
    userInput,
    onKeywordsGenerated,
    isGenerating,
    onGeneratingChange
}: DeepSearchKeywordGeneratorProps) {
    const [keywords, setKeywords] = useState<KeywordResult[]>([]);
    const [isExpanded, setIsExpanded] = useState(false);
    const [internalGenerating, setInternalGenerating] = useState(false);

    const actualGenerating = isGenerating || internalGenerating;

    // 调用API生成关键词
    const generateKeywords = async () => {
        if (!userInput.trim()) return;
        
        setInternalGenerating(true);
        onGeneratingChange?.(true);
        
        try {
            const response = await fetch('/api/local-aibot/generate-keywords', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ user_input: userInput })
            });

            if (!response.ok) {
                throw new Error('关键词生成失败');
            }

            const data = await response.json();
            
            if (data.success && data.keywords) {
                setKeywords(data.keywords);
                onKeywordsGenerated(data.keywords);
            } else {
                throw new Error(data.message || '关键词生成失败');
            }
        } catch (error) {
            console.error('关键词生成错误:', error);
            // 提供回退关键词
            const fallbackKeywords: KeywordResult[] = [
                {
                    keyword: userInput,
                    reason: '基于用户原始输入',
                    priority: 'high'
                }
            ];
            setKeywords(fallbackKeywords);
            onKeywordsGenerated(fallbackKeywords);
        } finally {
            setInternalGenerating(false);
            onGeneratingChange?.(false);
        }
    };

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'high': return 'text-[#C9A063]';
            case 'medium': return 'text-[#E8E6DC]';
            case 'low': return 'text-[#A2A09A]';
            default: return 'text-[#A2A09A]';
        }
    };

    const getPriorityBg = (priority: string) => {
        switch (priority) {
            case 'high': return 'bg-[rgba(201,160,99,0.2)]';
            case 'medium': return 'bg-[rgba(232,230,220,0.1)]';
            case 'low': return 'bg-[rgba(162,160,154,0.1)]';
            default: return 'bg-[rgba(162,160,154,0.1)]';
        }
    };

    return (
        <div className="mb-4">
            {/* 关键词生成触发器 */}
            <motion.div
                className="flex items-center justify-between p-3 rounded-lg border border-[#343434] bg-[rgba(27,27,27,0.6)] cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
                whileHover={{ backgroundColor: 'rgba(201, 160, 99, 0.15)' }}
                transition={{ duration: 0.2 }}
            >
                <div className="flex items-center gap-3">
                    <span className="text-[#C9A063] text-sm font-medium">
                        🔍 深度检索关键词分析
                    </span>
                    {keywords.length > 0 && (
                        <span className="text-[#E8E6DC] text-xs">
                            已生成 {keywords.length} 个关键词
                        </span>
                    )}
                </div>
                <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-[#A2A09A]"
                >
                    ▼
                </motion.div>
            </motion.div>

            {/* 关键词内容 */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                    >
                        <div className="p-4 border border-[#343434] border-t-0 rounded-b-lg bg-[rgba(26,26,26,0.8)]">
                            {/* 用户输入显示 */}
                            <div className="mb-4">
                                <h4 className="text-[#C9A063] text-sm font-medium mb-2">原始查询</h4>
                                <div className="p-3 bg-[#1B1B1B] rounded border border-[#343434]">
                                    <p className="text-[#E8E6DC] text-sm">{userInput}</p>
                                </div>
                            </div>

                            {/* 关键词列表 */}
                            {keywords.length > 0 && (
                                <div className="mb-4">
                                    <h4 className="text-[#C9A063] text-sm font-medium mb-3">生成的检索关键词</h4>
                                    <div className="space-y-2">
                                        {keywords.map((item, index) => (
                                            <motion.div
                                                key={index}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: index * 0.1 }}
                                                className="p-3 rounded-lg border border-[#343434] bg-[#1B1B1B]"
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className={`px-2 py-1 rounded text-xs font-medium ${getPriorityBg(item.priority)} ${getPriorityColor(item.priority)}`}>
                                                        {item.priority === 'high' ? '高' : item.priority === 'medium' ? '中' : '低'}
                                                    </div>
                                                    <div className="flex-1">
                                                        <h5 className="text-[#E8E6DC] font-medium text-sm mb-1">
                                                            {item.keyword}
                                                        </h5>
                                                        <p className="text-[#A2A09A] text-xs">{item.reason}</p>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 操作按钮 */}
                            <div className="flex gap-3">
                                {keywords.length === 0 && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            generateKeywords();
                                        }}
                                        disabled={isGenerating}
                                        className="px-4 py-2 bg-[#C9A063] text-black rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isGenerating ? '生成中...' : '生成关键词'}
                                    </button>
                                )}
                                
                                {keywords.length > 0 && (
                                    <>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                generateKeywords();
                                            }}
                                            disabled={isGenerating}
                                            className="px-4 py-2 border border-[#343434] text-[#E8E6DC] rounded-lg text-sm hover:bg-[#1B1B1B] transition-colors disabled:opacity-50"
                                        >
                                            重新生成
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setKeywords([]);
                                            }}
                                            className="px-4 py-2 border border-[#343434] text-[#A2A09A] rounded-lg text-sm hover:bg-[#1B1B1B] transition-colors"
                                        >
                                            清空
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}