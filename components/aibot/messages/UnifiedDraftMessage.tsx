'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { messageMarkdownComponents } from '@/lib/markdownComponents';

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

export interface UnifiedDraftMessageProps {
    title?: string;
    draftMarkdown: string;
    isStreaming?: boolean;
    isComplete?: boolean;
    userInput?: string;
    searchSnippets?: Array<{
        title: string;
        url: string;
        snippet?: string;
    }>;
    keywords?: Array<{
        keyword: string;
        reason?: string;
        priority?: string;
    }>;
    documents?: string[];
    onDraftChange?: (value: string) => void;
    onConfirm?: () => void;
    onRegenerate?: () => void;
    onCancel?: () => void;
    footerNotice?: React.ReactNode;
}

export default function UnifiedDraftMessage({
    title = '📝 检索草稿',
    draftMarkdown,
    isStreaming = false,
    isComplete = false,
    userInput,
    searchSnippets = [],
    keywords = [],
    documents = [],
    onDraftChange,
    onConfirm,
    onRegenerate,
    onCancel,
    footerNotice
}: UnifiedDraftMessageProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [showMetadata, setShowMetadata] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [draftEditValue, setDraftEditValue] = useState('');

    const cleanedDraft = cleanMarkdownCodeBlock(draftMarkdown || '');
    const editValue = isEditing ? draftEditValue : cleanedDraft;

    const handleStartEdit = () => {
        setDraftEditValue(cleanedDraft);
        setIsEditing(true);
    };

    const handleSaveEdit = () => {
        onDraftChange?.(editValue);
        setIsEditing(false);
    };

    const handleCancelEdit = () => {
        setDraftEditValue(cleanedDraft);
        setIsEditing(false);
    };

    const hasMetadata = searchSnippets.length > 0 || keywords.length > 0 || documents.length > 0;

    return (
        <div className="mb-4">
            {/* 顶栏提示信息（若有用户输入或文档信息） */}
            {userInput && (
                <div className="text-xs text-[#A2A09A] bg-transparent border border-[#C9A063]/20 p-2.5 mb-2 font-info-content">
                    <span className="text-[#C9A063]/70">输入背景：</span>
                    <span className="text-[#E8E6DC] ml-1">{userInput}</span>
                    {documents.length > 0 && (
                        <span className="text-[#C9A063]/50 ml-2">（共 {documents.length} 篇参考来源）</span>
                    )}
                </div>
            )}

            {/* 草稿头部 */}
            <motion.div
                className="flex items-center justify-between p-3 border border-[#C9A063]/30 bg-[#1a1a1a]/90 backdrop-blur-xl cursor-pointer"
                onClick={() => !isEditing && setIsExpanded(!isExpanded)}
                whileHover={{ backgroundColor: 'rgba(26, 26, 26, 0.95)' }}
                transition={{ duration: 0.2 }}
            >
                <div className="flex items-center gap-3">
                    <span className="text-[#C9A063] text-sm font-medium font-mono tracking-wider">
                        {title}
                    </span>
                    {isStreaming && (
                        <span className="animate-pulse text-xs text-[#A2A09A] font-mono tracking-wider">
                            生成中...
                        </span>
                    )}
                    {isComplete && !isStreaming && (
                        <span className="text-xs text-[#C9A063]/70 font-mono tracking-wider">
                            ✓ 生成完成 ({cleanedDraft.length} 字符)
                        </span>
                    )}
                    {!isComplete && !isStreaming && cleanedDraft && (
                        <span className="text-xs text-[#E8E6DC] font-mono tracking-wider">
                            {cleanedDraft.length} 字符
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {hasMetadata && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowMetadata(!showMetadata);
                            }}
                            className="bg-transparent border border-[#C9A063]/30 text-[#C9A063]/70 hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors text-xs px-2 py-1 font-mono tracking-wider"
                        >
                            源数据 (
                            {[
                                keywords.length > 0 ? `${keywords.length}词` : '',
                                searchSnippets.length > 0 ? `${searchSnippets.length}网页` : '',
                                documents.length > 0 ? `${documents.length}文档` : ''
                            ]
                                .filter(Boolean)
                                .join(' / ')}
                            )
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

            {/* 草稿内容与操作 */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                    >
                        <div className="border border-[#C9A063]/30 border-t-0 bg-[#1a1a1a]/90 backdrop-blur-xl p-4">
                            {/* 元数据展示抽屉 */}
                            <AnimatePresence>
                                {showMetadata && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="overflow-hidden mb-4"
                                    >
                                        <div className="border border-[#C9A063]/20 bg-[#141414]/90 p-3 text-xs space-y-3 font-info-content">
                                            {keywords.length > 0 && (
                                                <div>
                                                    <div className="text-[#C9A063] font-mono mb-1.5 font-medium">检索关键词</div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {keywords.map((kw, i) => (
                                                            <span
                                                                key={`kw-${i}`}
                                                                className="px-2 py-0.5 bg-[#C9A063]/10 border border-[#C9A063]/30 text-[#E8E6DC]"
                                                                title={kw.reason}
                                                            >
                                                                {kw.keyword}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {documents.length > 0 && (
                                                <div>
                                                    <div className="text-[#C9A063] font-mono mb-1.5 font-medium">分析文档</div>
                                                    <div className="space-y-1">
                                                        {documents.map((doc, i) => (
                                                            <div key={`doc-${i}`} className="text-[#A2A09A]">
                                                                📄 {doc}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {searchSnippets.length > 0 && (
                                                <div>
                                                    <div className="text-[#C9A063] font-mono mb-1.5 font-medium">参考网络内容</div>
                                                    <div className="space-y-2 max-h-36 overflow-y-auto about-overlay-scroll">
                                                        {searchSnippets.map((s, i) => (
                                                            <div key={`snippet-${i}`} className="border-b border-[#C9A063]/10 pb-1.5 last:border-b-0">
                                                                <a
                                                                    href={s.url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-[#C9A063] hover:underline block truncate"
                                                                >
                                                                    {s.title}
                                                                </a>
                                                                {s.snippet && (
                                                                    <p className="text-[#A2A09A] line-clamp-2 mt-0.5">{s.snippet}</p>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* 编辑模式与渲染模式 */}
                            {isEditing ? (
                                <div className="space-y-3">
                                    <textarea
                                        value={editValue}
                                        onChange={(e) => setDraftEditValue(e.target.value)}
                                        className="w-full h-64 bg-[#111111] border border-[#C9A063]/40 p-3 text-sm text-[#E8E6DC] font-info-content focus:outline-none focus:border-[#C9A063] resize-y"
                                        placeholder="编辑草稿内容..."
                                    />
                                    <div className="flex justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={handleCancelEdit}
                                            className="px-3 py-1.5 border border-[#A2A09A]/40 text-[#A2A09A] hover:text-[#E8E6DC] text-xs font-mono tracking-wider transition-colors"
                                        >
                                            取消
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleSaveEdit}
                                            className="px-3 py-1.5 bg-[#C9A063] text-[#1a1a1a] font-medium text-xs font-mono tracking-wider hover:bg-[#D4AF37] transition-colors"
                                        >
                                            保存草稿
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <div
                                        className="prose prose-invert prose-sm max-w-none max-h-96 overflow-y-auto about-overlay-scroll font-info-content pr-1"
                                        suppressHydrationWarning
                                    >
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={messageMarkdownComponents}
                                        >
                                            {cleanedDraft}
                                        </ReactMarkdown>
                                    </div>

                                    {/* 操作按钮区 */}
                                    <div className="mt-4 pt-3 border-t border-[#C9A063]/20 flex items-center justify-between flex-wrap gap-2">
                                        <div className="flex items-center gap-2">
                                            {onDraftChange && !isStreaming && (
                                                <button
                                                    type="button"
                                                    onClick={handleStartEdit}
                                                    className="px-3 py-1.5 border border-[#C9A063]/40 text-[#C9A063] hover:bg-[#C9A063]/10 text-xs font-mono tracking-wider transition-colors"
                                                >
                                                    ✏️ 编辑草稿
                                                </button>
                                            )}
                                            {onRegenerate && !isStreaming && (
                                                <button
                                                    type="button"
                                                    onClick={onRegenerate}
                                                    className="px-3 py-1.5 border border-[#A2A09A]/40 text-[#A2A09A] hover:text-[#E8E6DC] text-xs font-mono tracking-wider transition-colors"
                                                >
                                                    🔄 重新生成
                                                </button>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {onCancel && (
                                                <button
                                                    type="button"
                                                    onClick={onCancel}
                                                    className="px-3 py-1.5 border border-[#A2A09A]/40 text-[#A2A09A] hover:text-[#E8E6DC] text-xs font-mono tracking-wider transition-colors"
                                                >
                                                    取消
                                                </button>
                                            )}
                                            {onConfirm && (
                                                <button
                                                    type="button"
                                                    onClick={onConfirm}
                                                    disabled={isStreaming || !cleanedDraft}
                                                    className="px-4 py-1.5 bg-[#C9A063] text-[#1a1a1a] font-medium text-xs font-mono tracking-wider hover:bg-[#D4AF37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    确认并检索图书 →
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {footerNotice && (
                                <div className="mt-3 pt-3 border-t border-[#C9A063]/15">
                                    {footerNotice}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
