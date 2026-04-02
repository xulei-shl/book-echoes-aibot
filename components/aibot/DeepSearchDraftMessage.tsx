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
    const codeBlockPattern = /^```(?:markdown|md)?\s*\n?([\s\S]*?)\n?```\s*$/;
    const match = content.trim().match(codeBlockPattern);
    return match ? match[1].trim() : content;
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
                className="aibot-workflow-header cursor-pointer"
                onClick={() => !isEditing && setIsExpanded(!isExpanded)}
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
                            检索草稿
                        </span>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            {isStreaming && (
                                <span className="aibot-chip aibot-chip--active">生成中</span>
                            )}
                            {isComplete && !isStreaming && (
                                <span className="aibot-chip aibot-chip--success">已完成 · {cleanedDraft.length} 字</span>
                            )}
                            {!isStreaming && !isComplete && (
                                <span className="aibot-chip">等待确认</span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {searchSnippets.length > 0 && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowMetadata(!showMetadata);
                            }}
                            className="aibot-btn aibot-btn--ghost px-3 py-1 text-xs"
                        >
                            源数据 {searchSnippets.length}
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
                        <div className="aibot-workflow-card rounded-t-none border-t-0">
                            {/* 关键词展示 */}
                            {keywords.length > 0 && (
                                <div className="border-b border-[#C9A063]/10 px-4 py-4 md:px-5">
                                    <div className="flex flex-wrap gap-2">
                                        {keywords.map((kw, idx) => (
                                            <span
                                                key={idx}
                                                className={`aibot-chip ${
                                                    kw.priority === 'high' ? 'aibot-chip--active' :
                                                    kw.priority === 'medium' ? 'border-[#7B9DAE]/22 bg-[#7B9DAE]/10 text-[#C9D8E0]' :
                                                    ''
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
                                        className="overflow-hidden border-b border-[#C9A063]/10"
                                    >
                                        <div className="px-4 py-4 md:px-5">
                                            <h4 className="mb-3 font-info-content text-sm font-medium text-[#E8DCC8]">检索源数据</h4>
                                            <div className="aibot-scroll space-y-3 max-h-48 overflow-y-auto pr-1">
                                                {searchSnippets.map((snippet, index) => (
                                                    <div key={index} className="rounded-2xl border border-[#E8E6DC]/8 bg-[#151412] px-3 py-3">
                                                        <h5 className="mb-1 truncate font-info-content text-sm font-medium text-[#F3ECE0]">
                                                            {snippet.title}
                                                        </h5>
                                                        <p className="mb-2 line-clamp-2 text-xs leading-5 text-[#A9A293] font-info-content">
                                                            {snippet.snippet}
                                                        </p>
                                                        <a
                                                            href={snippet.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-xs text-[#C9A063] hover:text-[#E8D7BB] transition-colors font-info-content"
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
                            <div className="aibot-workflow-body">
                                {isEditing ? (
                                    <div>
                                        <textarea
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            className="aibot-scroll h-72 w-full resize-none rounded-[1.25rem] border border-[#C9A063]/14 bg-[#11100E]/85 p-4 text-sm leading-7 text-[#E8E6DC] focus:outline-none focus:border-[#C9A063]/40 font-info-content"
                                            placeholder="编辑检索草稿..."
                                        />
                                        <div className="mt-3 flex gap-2">
                                            <button
                                                onClick={handleSaveEdit}
                                                className="aibot-btn aibot-btn--primary"
                                            >
                                                保存
                                            </button>
                                            <button
                                                onClick={handleCancelEdit}
                                                className="aibot-btn aibot-btn--ghost"
                                            >
                                                取消
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="aibot-scroll max-h-80 overflow-y-auto pr-1">
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
                                            <div className="py-8 text-center">
                                                <p className="text-sm text-[#A2A09A] font-info-content">等待草稿生成...</p>
                                            </div>
                                        )}

                                        {/* 流式输出时的光标指示 */}
                                        {isStreaming && cleanedDraft && (
                                            <span className="ml-1 inline-block h-4 w-2 animate-pulse rounded-full bg-[#C9A063] align-middle"></span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* 操作按钮 - 仅在完成且非编辑模式时显示 */}
                            {isComplete && !isEditing && (
                                <div className="aibot-workflow-footer">
                                    <div className="flex flex-wrap gap-2">
                                        {onCancel && (
                                            <button
                                                onClick={onCancel}
                                                className="aibot-btn aibot-btn--ghost"
                                            >
                                                取消
                                            </button>
                                        )}
                                        {onRegenerate && (
                                            <button
                                                onClick={onRegenerate}
                                                className="aibot-btn aibot-btn--secondary"
                                            >
                                                重新生成
                                            </button>
                                        )}
                                        <button
                                            onClick={handleStartEdit}
                                            className="aibot-btn aibot-btn--secondary"
                                        >
                                            编辑
                                        </button>
                                    </div>

                                    {onConfirm && (
                                        <button
                                            onClick={onConfirm}
                                            disabled={!cleanedDraft.trim()}
                                            className="aibot-btn aibot-btn--primary"
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
                <div className="flex items-center gap-2 text-sm font-medium text-[#E8E6DC]">
                    {deepSearchPhase === 'book-search' ? (
                        <>
                            <div className="w-3 h-3 border-2 border-[#C9A063] border-t-transparent rounded-full animate-spin"></div>
                            正在检索相关图书...
                        </>
                    ) : (
                        <>
                            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                            图书检索完成
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
