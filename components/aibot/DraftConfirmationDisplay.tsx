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
                            草稿确认
                        </span>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            {isGenerating && <span className="aibot-chip aibot-chip--active">生成中</span>}
                            {draftMarkdown && !isGenerating && <span className="aibot-chip">{draftMarkdown.length} 字</span>}
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
                                                        <h5 className="mb-1 truncate text-sm font-medium text-[#F3ECE0] font-info-content">
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

                            {/* Markdown 实时渲染与编辑 */}
                            <div className="aibot-workflow-body">
                                <div className="mb-3 flex items-center justify-between">
                                    <div className="text-xs text-[#6F6D68] mt-1 font-info-content">
                                        {isEditing ? '纯文本编辑模式' : '确认后将用于深度检索'}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isGenerating && cleanedDraft && !isEditing && (
                                            <span className="text-xs text-[#A2A09A] font-info-content">流式更新中...</span>
                                        )}
                                        {!isGenerating && (
                                            isEditing ? (
                                                <>
                                                    <button
                                                        onClick={handleSaveEdit}
                                                        className="aibot-btn aibot-btn--primary px-3 py-1 text-xs"
                                                    >
                                                        保存
                                                    </button>
                                                    <button
                                                        onClick={handleCancelEdit}
                                                        className="aibot-btn aibot-btn--ghost px-3 py-1 text-xs"
                                                    >
                                                        取消
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={handleStartEdit}
                                                    className="aibot-btn aibot-btn--secondary px-3 py-1 text-xs"
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
                                        className="aibot-scroll h-64 w-full resize-none rounded-[1.25rem] border border-[#C9A063]/14 bg-[#11100E]/85 p-4 text-sm leading-7 text-[#E8E6DC] focus:outline-none focus:border-[#C9A063]/40 font-info-content"
                                        placeholder="检索草稿将在此显示..."
                                    />
                                ) : (
                                    <div className="aibot-scroll max-h-80 overflow-y-auto rounded-[1.25rem] border border-[#E8E6DC]/8 bg-[#11100E]/75 p-4 pr-3">
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
                                            <span className="ml-1 inline-block h-4 w-2 rounded-full bg-[#C9A063] animate-pulse align-middle" />
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* 操作按钮 */}
                            <div className="aibot-workflow-footer">
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={onCancel}
                                        className="aibot-btn aibot-btn--ghost"
                                    >
                                        取消
                                    </button>
                                    <button
                                        onClick={onRegenerate}
                                        disabled={isGenerating}
                                        className="aibot-btn aibot-btn--secondary"
                                    >
                                        {isGenerating ? '生成中...' : '重新生成'}
                                    </button>
                                </div>

                                <button
                                    onClick={onConfirm}
                                    disabled={!draftMarkdown.trim() || isGenerating}
                                    className="aibot-btn aibot-btn--primary"
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
