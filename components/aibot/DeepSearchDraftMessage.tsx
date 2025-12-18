'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { messageMarkdownComponents } from '@/lib/markdownComponents';
import type { DuckDuckGoSnippet, KeywordResult } from '@/src/core/aibot/types';

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
                className="flex items-center justify-between p-3 rounded-t-xl border border-[#343434] bg-[rgba(201,160,99,0.1)] cursor-pointer"
                onClick={() => !isEditing && setIsExpanded(!isExpanded)}
                whileHover={{ backgroundColor: 'rgba(201, 160, 99, 0.15)' }}
                transition={{ duration: 0.2 }}
            >
                <div className="flex items-center gap-3">
                    <span className="text-[#C9A063] text-sm font-medium font-body">
                        📝 检索草稿
                    </span>
                    {isStreaming && (
                        <span className="animate-pulse text-xs text-[#A2A09A] font-body">生成中...</span>
                    )}
                    {isComplete && !isStreaming && (
                        <span className="text-xs text-green-400 font-body">
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
                            className="text-xs px-2 py-1 rounded border border-[#343434] text-[#A2A09A] hover:bg-[#1B1B1B] transition-colors font-body"
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
                        <div className="border border-[#343434] border-t-0 rounded-b-xl bg-[rgba(26,26,26,0.8)]">
                            {/* 关键词展示 */}
                            {keywords.length > 0 && (
                                <div className="p-4 border-b border-[#343434]">
                                    <div className="flex flex-wrap gap-2">
                                        {keywords.map((kw, idx) => (
                                            <span
                                                key={idx}
                                                className={`text-xs px-2 py-1 rounded font-body ${
                                                    kw.priority === 'high' ? 'bg-[#C9A063]/20 text-[#C9A063]' :
                                                    kw.priority === 'medium' ? 'bg-blue-500/20 text-blue-400' :
                                                    'bg-[#343434] text-[#A2A09A]'
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
                                        className="overflow-hidden border-b border-[#343434]"
                                    >
                                        <div className="p-4">
                                            <h4 className="text-[#C9A063] text-sm font-medium mb-3 font-body">检索源数据</h4>
                                            <div className="space-y-3 max-h-48 overflow-y-auto aibot-scroll">
                                                {searchSnippets.map((snippet, index) => (
                                                    <div key={index} className="p-3 bg-[#1B1B1B] rounded-lg border border-[#343434]">
                                                        <h5 className="text-[#E8E6DC] font-medium text-sm mb-1 truncate font-body">
                                                            {snippet.title}
                                                        </h5>
                                                        <p className="text-[#A2A09A] text-xs mb-2 line-clamp-2 font-body">
                                                            {snippet.snippet}
                                                        </p>
                                                        <a
                                                            href={snippet.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-[#C9A063] text-xs hover:underline font-body"
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
                                            className="w-full h-64 rounded-lg bg-[#1B1B1B] border border-[#343434] text-sm text-[#E8E6DC] p-3 focus:outline-none focus:border-[#C9A063] font-info-content resize-none aibot-scroll"
                                            placeholder="编辑检索草稿..."
                                        />
                                        <div className="flex gap-2 mt-3">
                                            <button
                                                onClick={handleSaveEdit}
                                                className="px-3 py-1 bg-[#C9A063] text-black rounded text-sm font-medium hover:bg-[#D4A863] transition-colors font-body"
                                            >
                                                保存
                                            </button>
                                            <button
                                                onClick={handleCancelEdit}
                                                className="px-3 py-1 border border-[#343434] text-[#A2A09A] rounded text-sm hover:bg-[#1B1B1B] transition-colors font-body"
                                            >
                                                取消
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    // 预览模式
                                    <div className="max-h-80 overflow-y-auto aibot-scroll">
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
                                                <p className="text-[#A2A09A] text-sm font-body">等待草稿生成...</p>
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
                                <div className="p-4 border-t border-[#343434] flex items-center justify-between">
                                    <div className="flex gap-3">
                                        {onCancel && (
                                            <button
                                                onClick={onCancel}
                                                className="px-4 py-2 border border-[#343434] text-[#A2A09A] rounded-lg text-sm hover:bg-[#1B1B1B] transition-colors font-body"
                                            >
                                                取消
                                            </button>
                                        )}
                                        {onRegenerate && (
                                            <button
                                                onClick={onRegenerate}
                                                className="px-4 py-2 border border-[#343434] text-[#E8E6DC] rounded-lg text-sm hover:bg-[#1B1B1B] transition-colors font-body"
                                            >
                                                重新生成
                                            </button>
                                        )}
                                        <button
                                            onClick={handleStartEdit}
                                            className="px-4 py-2 border border-[#343434] text-[#E8E6DC] rounded-lg text-sm hover:bg-[#1B1B1B] transition-colors font-body"
                                        >
                                            编辑
                                        </button>
                                    </div>

                                    {onConfirm && (
                                        <button
                                            onClick={onConfirm}
                                            disabled={!cleanedDraft.trim()}
                                            className="px-6 py-2 bg-[#C9A063] text-black rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#D4A863] transition-colors font-body"
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
        </div>
    );
}
