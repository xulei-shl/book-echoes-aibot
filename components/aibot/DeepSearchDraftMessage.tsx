'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { messageMarkdownComponents } from '@/lib/markdownComponents';
import type { DuckDuckGoSnippet, KeywordResult } from '@/src/core/aibot/types';
import { useAIBotStore } from '@/store/aibot/useAIBotStore';

// 清理 markdown 代码块包裹
const cleanMarkdownCodeBlock = (content: string): string => {
    const openingFencePattern = /^```(?:markdown|md)?\s*\n?/i;
    const closingFencePattern = /\n?```\s*$/;

    if (!openingFencePattern.test(content)) {
        return content;
    }

    let normalizedContent = content.replace(openingFencePattern, '');

    if (closingFencePattern.test(normalizedContent)) {
        normalizedContent = normalizedContent.replace(closingFencePattern, '');
    }

    return normalizedContent;
};

interface DeepSearchDraftMessageProps {
    draftMarkdown: string;
    isStreaming: boolean;
    isComplete: boolean;
    searchSnippets: DuckDuckGoSnippet[];
    keywords: KeywordResult[];
    userInput: string;
    onDraftChange?: (value: string) => void;
    onConfirm?: () => void;
    onRegenerate?: () => void;
    onCancel?: () => void;
}

export default function DeepSearchDraftMessage({
    draftMarkdown,
    isStreaming,
    isComplete,
    searchSnippets,
    keywords,
    userInput,
    onDraftChange,
    onConfirm,
    onRegenerate,
    onCancel
}: DeepSearchDraftMessageProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [showMetadata, setShowMetadata] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState('');
    const { deepSearchPhase } = useAIBotStore();

    // 当草稿完成时，初始化编辑值
    useEffect(() => {
        if (isComplete && draftMarkdown) {
            setEditValue(cleanMarkdownCodeBlock(draftMarkdown));
        }
    }, [isComplete, draftMarkdown]);

    // 清理后的草稿内容
    const cleanedDraft = cleanMarkdownCodeBlock(draftMarkdown);

    // 进入编辑模式
    const handleStartEdit = () => {
        setEditValue(cleanedDraft);
        setIsEditing(true);
    };

    // 保存编辑
    const handleSaveEdit = () => {
        onDraftChange?.(editValue);
        setIsEditing(false);
    };

    // 取消编辑
    const handleCancelEdit = () => {
        setEditValue(cleanedDraft);
        setIsEditing(false);
    };

    return (
        <div className="mb-4">
            {/* 草稿头部 */}
            <motion.div
                className="flex items-center justify-between p-3 border border-[#C9A063]/30 bg-[#1a1a1a]/90 backdrop-blur-xl cursor-pointer"
                onClick={() => !isEditing && setIsExpanded(!isExpanded)}
                whileHover={{ backgroundColor: 'rgba(26, 26, 26, 0.95)' }}
                transition={{ duration: 0.2 }}
            >
                <div className="flex items-center gap-3">
                    <span className="text-[#C9A063] text-sm font-medium font-mono tracking-wider">
                        📝 检索草稿
                    </span>
                    {isStreaming && (
                        <span className="animate-pulse text-xs text-[#A2A09A] font-mono tracking-wider">生成中...</span>
                    )}
                    {isComplete && !isStreaming && (
                        <span className="text-xs text-[#C9A063]/70 font-mono tracking-wider">
                            ✓ 生成完成 ({cleanedDraft.length} 字符)
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {searchSnippets.length > 0 && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowMetadata(!showMetadata);
                            }}
                            className="bg-transparent border border-[#C9A063]/30 text-[#C9A063]/70 hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors text-xs px-2 py-1 font-mono tracking-wider"
                        >
                            源数据 ({searchSnippets.length})
                        </button>
                    )}
                    <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-[#A2A09A]"
                    >
                        ▼
                    </motion.div>
                </div>
            </motion.div>

            {/* 草稿内容 */}
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
                            {/* 关键词展示 */}
                            {keywords.length > 0 && (
                                <div className="p-4 border-b border-[#C9A063]/30">
                                    <div className="flex flex-wrap gap-2">
                                        {keywords.map((kw, idx) => (
                                            <span
                                                key={idx}
                                                className={`text-xs px-2 py-1 font-mono tracking-wider ${kw.priority === 'high' ? 'border border-[#C9A063]/30 text-[#C9A063]' :
                                                        kw.priority === 'medium' ? 'border border-[#C9A063]/20 text-[#C9A063]/80' :
                                                            'border border-[#C9A063]/10 text-[#C9A063]/50'
                                                    }`}
                                            >
                                                {kw.keyword}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 源数据展示 */}
                            <AnimatePresence>
                                {showMetadata && searchSnippets.length > 0 && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.3 }}
                                        className="overflow-hidden border-b border-[#C9A063]/30"
                                    >
                                        <div className="p-4">
                                            <h4 className="text-[#C9A063] text-sm font-medium mb-3 font-mono tracking-wider">检索源数据</h4>
                                            <div className="space-y-3 max-h-48 overflow-y-auto about-overlay-scroll">
                                                {searchSnippets.map((snippet, index) => (
                                                    <div key={index} className="p-3 bg-transparent border border-[#C9A063]/20">
                                                        <h5 className="text-[#E8E6DC] font-medium text-sm mb-1 truncate font-info-content">
                                                            {snippet.title}
                                                        </h5>
                                                        <p className="text-[#A2A09A] text-xs mb-2 line-clamp-2 font-info-content">
                                                            {snippet.snippet}
                                                        </p>
                                                        <a
                                                            href={snippet.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-[#C9A063] text-xs hover:underline font-info-content"
                                                        >
                                                            查看原文
                                                        </a>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* 草稿内容区域 */}
                            <div className="p-4">
                                {isEditing ? (
                                    // 编辑模式
                                    <div>
                                        <textarea
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            className="w-full h-64 bg-transparent border border-[#C9A063]/30 text-sm text-[#E8E6DC] p-3 focus:outline-none focus:border-[#C9A063] font-info-content resize-none about-overlay-scroll"
                                            placeholder="编辑检索草稿..."
                                        />
                                        <div className="flex gap-2 mt-3">
                                            <button
                                                onClick={handleSaveEdit}
                                                className="px-3 py-1 bg-[#C9A063] text-[#1a1a1a] border border-[#C9A063] text-sm hover:bg-[#C9A063]/20 hover:text-[#C9A063] transition-colors font-mono tracking-wider"
                                            >
                                                保存
                                            </button>
                                            <button
                                                onClick={handleCancelEdit}
                                                className="px-3 py-1 bg-transparent border border-[#C9A063]/30 text-[#C9A063]/70 text-sm hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors font-mono tracking-wider"
                                            >
                                                取消
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    // 预览模式
                                    <div className="max-h-80 overflow-y-auto about-overlay-scroll">
                                        {cleanedDraft ? (
                                            <div
                                                className="prose prose-invert prose-sm max-w-none font-info-content"
                                                suppressHydrationWarning
                                                key={`draft-markdown-${Date.now()}`}
                                            >
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={messageMarkdownComponents}
                                                >
                                                    {cleanedDraft}
                                                </ReactMarkdown>
                                            </div>
                                        ) : (
                                            <div className="text-center py-8">
                                                <p className="text-[#A2A09A] text-sm font-info-content">等待草稿生成...</p>
                                            </div>
                                        )}

                                        {/* 流式输出时的光标指示 */}
                                        {isStreaming && cleanedDraft && (
                                            <span className="inline-block w-2 h-4 bg-[#C9A063] animate-pulse ml-1 align-middle"></span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* 操作按钮 - 仅在完成且非编辑模式时显示 */}
                            {isComplete && !isEditing && (
                                <div className="p-4 border-t border-[#C9A063]/30 flex items-center justify-between">
                                    <div className="flex gap-3">
                                        {onCancel && (
                                            <button
                                                onClick={onCancel}
                                                className="px-4 py-2 bg-transparent border border-[#C9A063]/30 text-[#C9A063]/70 text-sm hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors font-mono tracking-wider"
                                            >
                                                取消
                                            </button>
                                        )}
                                        {onRegenerate && (
                                            <button
                                                onClick={onRegenerate}
                                                className="px-4 py-2 bg-transparent border border-[#C9A063]/30 text-[#C9A063]/70 text-sm hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors font-mono tracking-wider"
                                            >
                                                重新生成
                                            </button>
                                        )}
                                        <button
                                            onClick={handleStartEdit}
                                            className="px-4 py-2 bg-transparent border border-[#C9A063]/30 text-[#C9A063]/70 text-sm hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors font-mono tracking-wider"
                                        >
                                            编辑
                                        </button>
                                    </div>

                                    {onConfirm && (
                                        <button
                                            onClick={onConfirm}
                                            disabled={!cleanedDraft.trim()}
                                            className="px-6 py-2 bg-[#C9A063] text-[#1a1a1a] border border-[#C9A063] text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#C9A063]/20 hover:text-[#C9A063] transition-colors font-mono tracking-wider"
                                        >
                                            确认检索
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 图书检索进度提示 - 放在交叉分析模块底部 */}
            {(deepSearchPhase === 'book-search' || deepSearchPhase === 'book-selection') && (
                <div className="flex items-center gap-2 text-sm font-mono tracking-wider text-[#C9A063]/70 mt-4">
                    {deepSearchPhase === 'book-search' ? (
                        <>
                            <div className="w-3 h-3 border border-[#C9A063] border-t-transparent animate-spin"></div>
                            正在检索相关图书...
                        </>
                    ) : (
                        <>
                            <div className="w-2 h-2 bg-[#C9A063]"></div>
                            图书检索完成
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
