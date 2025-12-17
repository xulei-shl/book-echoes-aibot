'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DeepSearchKeywordGenerator from './DeepSearchKeywordGenerator';
import DraftConfirmationDisplay from './DraftConfirmationDisplay';
import DeepSearchBookList from './DeepSearchBookList';
import type { BookInfo } from '@/src/core/aibot/types';

interface KeywordResult {
    keyword: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
}

type DeepSearchPhase = 'keywords' | 'draft' | 'search' | 'selection' | 'interpretation' | 'completed';

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
    const [phase, setPhase] = useState<DeepSearchPhase>('keywords');
    const [keywords, setKeywords] = useState<KeywordResult[]>([]);
    const [draftMarkdown, setDraftMarkdown] = useState('');
    const [searchSnippets, setSearchSnippets] = useState<any[]>([]);
    const [books, setBooks] = useState<BookInfo[]>([]);
    const [selectedBooks, setSelectedBooks] = useState<BookInfo[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    // 关键词生成完成
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
        setPhase('keywords');
        setDraftMarkdown('');
        setSearchSnippets([]);
        setBooks([]);
        setSelectedBooks([]);
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
            {/* 关键词生成阶段 */}
            <AnimatePresence>
                {phase === 'keywords' && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3 }}
                    >
                        <DeepSearchKeywordGenerator
                            userInput={userInput}
                            onKeywordsGenerated={handleKeywordsGenerated}
                            isGenerating={isLoading}
                            onGeneratingChange={setIsLoading}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 草稿确认阶段 */}
            <AnimatePresence>
                {(phase === 'draft' || phase === 'search') && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3 }}
                    >
                        <DraftConfirmationDisplay
                            draftMarkdown={draftMarkdown}
                            onDraftChange={setDraftMarkdown}
                            onConfirm={handleDraftConfirm}
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
                {['keywords', 'draft', 'search', 'selection', 'interpretation'].map((p, index) => (
                    <div key={p} className="flex items-center gap-2">
                        <div 
                            className={`w-2 h-2 rounded-full ${
                                phase === p ? 'bg-[#C9A063]' : 
                                ['keywords', 'draft', 'search', 'selection', 'interpretation'].indexOf(p) < 
                                ['keywords', 'draft', 'search', 'selection', 'interpretation'].indexOf(phase) 
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