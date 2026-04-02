'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { messageMarkdownComponents } from '@/lib/markdownComponents';

// 兼容 LLM 输出时整体包裹 ```markdown ... ``` 的情况
const cleanMarkdownCodeBlock = (content: string): string => {
    const codeBlockPattern = /^```(?:markdown|md)?\s*\n?([\s\S]*?)\n?```\s*$/;
    const match = content.trim().match(codeBlockPattern);
    return match ? match[1].trim() : content;
};

interface DraftConfirmationDisplayProps {
    draftMarkdown: string;
    onDraftChange: (value: string) => void;
    onConfirm: () => void;
    onCancel: () => void;
    onRegenerate: () => void;
    isGenerating?: boolean;
    searchSnippets?: Array<{
        title: string;
        url: string;
        snippet: string;
    }>;
}

export default function DraftConfirmationDisplay({
    draftMarkdown,
    onDraftChange,
    onConfirm,
    onCancel,
    onRegenerate,
    isGenerating = false,
    searchSnippets = []
}: DraftConfirmationDisplayProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [showMetadata, setShowMetadata] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState('');
    const cleanedDraft = cleanMarkdownCodeBlock(draftMarkdown || '');

    useEffect(() => {
        if (!isEditing) {
            setEditValue(cleanedDraft);
        }
    }, [cleanedDraft, isEditing]);

    const handleStartEdit = () => {
        setEditValue(cleanedDraft);
        setIsEditing(true);
    };

    const handleSaveEdit = () => {
        onDraftChange(editValue);
        setIsEditing(false);
    };

    const handleCancelEdit = () => {
        setEditValue(cleanedDraft);
        setIsEditing(false);
    };

    return (
        <div className="mb-4">
            {/* 草稿确认头部 */}
            <motion.div
                className="flex items-center justify-between p-3 border border-[#C9A063]/30 bg-[#1a1a1a]/90 backdrop-blur-xl cursor-pointer"
                onClick={() => !isEditing && setIsExpanded(!isExpanded)}
                whileHover={{ backgroundColor: 'rgba(26, 26, 26, 0.95)' }}
                transition={{ duration: 0.2 }}
            >
                <div className="flex items-center gap-3">
                    <span className="text-[#C9A063] text-sm font-medium font-mono tracking-wider">
                        📝 草稿确认
                    </span>
                    {isGenerating && (
                        <span className="animate-pulse text-xs text-[#A2A09A] font-mono tracking-wider">生成中...</span>
                    )}
                    {draftMarkdown && !isGenerating && (
                        <span className="text-xs text-[#E8E6DC] font-mono tracking-wider">
                            {draftMarkdown.length} 字符
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
                            {/* 源数据展示 */}
                            <AnimatePresence>
                                {showMetadata && searchSnippets.length > 0 && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.3 }}
                                        className="overflow-hidden border-b border-[#C9A063]/20"
                                    >
                                        <div className="p-4">
                                            <h4 className="text-[#C9A063] text-sm font-mono tracking-wider mb-3">检索源数据</h4>
                                            <div className="space-y-3 max-h-48 overflow-y-auto about-overlay-scroll">
                                                {searchSnippets.map((snippet, index) => (
                                                    <div key={index} className="p-3 bg-[#111111]/80 border border-[#C9A063]/15">
                                                        <h5 className="text-[#E8E6DC] text-sm mb-1 truncate font-info-content">
                                                            {snippet.title}
                                                        </h5>
                                                        <p className="text-[#A2A09A] text-xs mb-2 line-clamp-2 font-info-content">
                                                            {snippet.snippet}
                                                        </p>
                                                        <a
                                                            href={snippet.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-[#C9A063] text-xs hover:underline font-mono tracking-wider"
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

                            {/* Markdown 实时渲染与编辑 */}
                            <div className="p-4">
                                <div className="mb-3 flex items-center justify-between">
                                    <div>
                                        <div className="text-xs text-[#6F6D68] mt-1 font-info-content">
                                            {isEditing ? '纯文本编辑模式' : '确认后将用于深度检索'}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isGenerating && cleanedDraft && !isEditing && (
                                            <span className="text-xs text-[#A2A09A] font-mono tracking-wider">流式更新中...</span>
                                        )}
                                        {!isGenerating && (
                                            isEditing ? (
                                                <>
                                                    <button
                                                        onClick={handleSaveEdit}
                                                        className="px-3 py-1 border border-[#C9A063] bg-[#C9A063] text-[#1a1a1a] text-xs font-mono tracking-wider hover:bg-transparent hover:text-[#C9A063] transition-colors"
                                                    >
                                                        保存
                                                    </button>
                                                    <button
                                                        onClick={handleCancelEdit}
                                                        className="px-3 py-1 border border-[#C9A063]/20 text-[#C9A063]/70 text-xs hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors font-mono tracking-wider"
                                                    >
                                                        取消
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={handleStartEdit}
                                                    className="px-3 py-1 border border-[#C9A063]/30 text-[#E8E6DC] text-xs hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors font-mono tracking-wider"
                                                >
                                                    编辑
                                                </button>
                                            )
                                        )}
                                    </div>
                                </div>

                                {isEditing ? (
                                    <textarea
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        className="w-full h-64 bg-[#111111]/80 border border-[#C9A063]/20 text-sm text-[#E8E6DC] p-3 focus:outline-none focus:border-[#C9A063] font-info-content resize-none about-overlay-scroll"
                                        placeholder="检索草稿将在此显示..."
                                    />
                                ) : (
                                    <div className="border border-[#C9A063]/15 bg-[#111111]/80 p-3 max-h-80 overflow-y-auto about-overlay-scroll">
                                        {cleanedDraft ? (
                                            <div
                                                className="prose prose-invert prose-sm max-w-none font-info-content"
                                                suppressHydrationWarning
                                            >
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={messageMarkdownComponents}
                                                >
                                                    {cleanedDraft}
                                                </ReactMarkdown>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-[#6F6D68] font-info-content">等待内容生成...</p>
                                        )}
                                        {isGenerating && cleanedDraft && (
                                            <span className="inline-block w-2 h-4 bg-[#C9A063] animate-pulse ml-1 align-middle" />
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* 操作按钮 */}
                            <div className="p-4 border-t border-[#C9A063]/20 flex items-center justify-between">
                                <div className="flex gap-3">
                                    <button
                                        onClick={onCancel}
                                        className="px-4 py-2 border border-[#C9A063]/20 text-[#C9A063]/70 text-sm hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors font-mono tracking-wider"
                                    >
                                        取消
                                    </button>
                                    <button
                                        onClick={onRegenerate}
                                        disabled={isGenerating}
                                        className="px-4 py-2 border border-[#C9A063]/30 text-[#E8E6DC] text-sm hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors disabled:opacity-50 font-mono tracking-wider"
                                    >
                                        {isGenerating ? '生成中...' : '重新生成'}
                                    </button>
                                </div>

                                <button
                                    onClick={onConfirm}
                                    disabled={!draftMarkdown.trim() || isGenerating}
                                    className="px-6 py-2 border border-[#C9A063] bg-[#C9A063] text-[#1a1a1a] text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-transparent hover:text-[#C9A063] transition-colors font-mono tracking-wider"
                                >
                                    确认检索
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
