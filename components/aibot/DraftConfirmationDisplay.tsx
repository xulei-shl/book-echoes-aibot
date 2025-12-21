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
                className="flex items-center justify-between p-3 rounded-t-xl border border-[#343434] bg-[rgba(201,160,99,0.1)] cursor-pointer"
                onClick={() => !isEditing && setIsExpanded(!isExpanded)}
                whileHover={{ backgroundColor: 'rgba(201, 160, 99, 0.2)' }}
                transition={{ duration: 0.2 }}
            >
                <div className="flex items-center gap-3">
                    <span className="text-[#C9A063] text-sm font-medium">
                        📝 草稿确认
                    </span>
                    {isGenerating && (
                        <span className="animate-pulse text-xs text-[#A2A09A]">生成中...</span>
                    )}
                    {draftMarkdown && !isGenerating && (
                        <span className="text-xs text-[#E8E6DC]">
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
                            className="text-xs px-2 py-1 rounded border border-[#343434] text-[#A2A09A] hover:bg-[#1B1B1B] transition-colors"
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
                                            <h4 className="text-[#C9A063] text-sm font-medium mb-3">检索源数据</h4>
                                            <div className="space-y-3 max-h-48 overflow-y-auto about-overlay-scroll">
                                                {searchSnippets.map((snippet, index) => (
                                                    <div key={index} className="p-3 bg-[#1B1B1B] rounded-lg border border-[#343434]">
                                                        <h5 className="text-[#E8E6DC] font-medium text-sm mb-1 truncate">
                                                            {snippet.title}
                                                        </h5>
                                                        <p className="text-[#A2A09A] text-xs mb-2 line-clamp-2">
                                                            {snippet.snippet}
                                                        </p>
                                                        <a 
                                                            href={snippet.url} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            className="text-[#C9A063] text-xs hover:underline"
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
                                        <h4 className="text-[#C9A063] text-sm font-medium">交叉分析草稿</h4>
                                        <div className="text-xs text-[#6F6D68] mt-1">
                                            {isEditing ? '纯文本编辑模式' : '确认后将用于深度检索'}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isGenerating && cleanedDraft && !isEditing && (
                                            <span className="text-xs text-[#A2A09A]">流式更新中...</span>
                                        )}
                                        {!isGenerating && (
                                            isEditing ? (
                                                <>
                                                    <button
                                                        onClick={handleSaveEdit}
                                                        className="px-3 py-1 bg-[#C9A063] text-black rounded text-xs font-medium hover:bg-[#D4A863] transition-colors"
                                                    >
                                                        保存
                                                    </button>
                                                    <button
                                                        onClick={handleCancelEdit}
                                                        className="px-3 py-1 border border-[#343434] text-[#A2A09A] rounded text-xs hover:bg-[#1B1B1B] transition-colors"
                                                    >
                                                        取消
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={handleStartEdit}
                                                    className="px-3 py-1 border border-[#343434] text-[#E8E6DC] rounded text-xs hover:bg-[#1B1B1B] transition-colors"
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
                                        className="w-full h-64 rounded-lg bg-[#1B1B1B] border border-[#343434] text-sm text-[#E8E6DC] p-3 focus:outline-none focus:border-[#C9A063] font-info-content resize-none"
                                        placeholder="检索草稿将在此显示..."
                                    />
                                ) : (
                                    <div className="rounded-lg border border-[#343434] bg-[#1B1B1B] p-3 max-h-80 overflow-y-auto about-overlay-scroll">
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
                                            <p className="text-xs text-[#6F6D68]">等待内容生成...</p>
                                        )}
                                        {isGenerating && cleanedDraft && (
                                            <span className="inline-block w-2 h-4 bg-[#C9A063] animate-pulse ml-1 align-middle" />
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* 操作按钮 */}
                            <div className="p-4 border-t border-[#343434] flex items-center justify-between">
                                <div className="flex gap-3">
                                    <button
                                        onClick={onCancel}
                                        className="px-4 py-2 border border-[#343434] text-[#A2A09A] rounded-lg text-sm hover:bg-[#1B1B1B] transition-colors"
                                    >
                                        取消
                                    </button>
                                    <button
                                        onClick={onRegenerate}
                                        disabled={isGenerating}
                                        className="px-4 py-2 border border-[#343434] text-[#E8E6DC] rounded-lg text-sm hover:bg-[#1B1B1B] transition-colors disabled:opacity-50"
                                    >
                                        {isGenerating ? '生成中...' : '重新生成'}
                                    </button>
                                </div>
                                
                                <button
                                    onClick={onConfirm}
                                    disabled={!draftMarkdown.trim() || isGenerating}
                                    className="px-6 py-2 bg-[#C9A063] text-black rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#D4A863] transition-colors"
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
