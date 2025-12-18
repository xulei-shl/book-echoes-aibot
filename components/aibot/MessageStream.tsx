'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { UIMessage } from 'ai';
import RetrievalResultDisplay from './RetrievalResultDisplay';
import ProgressLogDisplay from './ProgressLogDisplay';
import DeepSearchProgressMessage from './DeepSearchProgressMessage';
import DeepSearchDraftMessage from './DeepSearchDraftMessage';
import DeepSearchBookListMessage from './DeepSearchBookListMessage';
import type { LogEntry } from './ProgressLogDisplay';
import { messageMarkdownComponents } from '@/lib/markdownComponents';
import { useAIBotStore } from '@/store/aibot/useAIBotStore';
import type { RetrievalPhase, BookInfo, DeepSearchLogEntry, KeywordResult, DuckDuckGoSnippet } from '@/src/core/aibot/types';

// 深度检索消息内容类型定义
interface DeepSearchProgressMessageContent {
    type: 'deep-search-progress';
    logs: DeepSearchLogEntry[];
    currentPhase: string;
}

interface DeepSearchDraftMessageContent {
    type: 'deep-search-draft';
    draftMarkdown: string;
    isStreaming: boolean;
    isComplete: boolean;
    searchSnippets: DuckDuckGoSnippet[];
    keywords: KeywordResult[];
    userInput: string;
}

interface DeepSearchBooksMessageContent {
    type: 'deep-search-books';
    books: BookInfo[];
    draftMarkdown: string;
    userInput: string;
}

interface DeepSearchReportMessageContent {
    type: 'deep-search-report';
    reportMarkdown: string;
    isStreaming: boolean;
    isComplete: boolean;
    selectedBooks: BookInfo[];
}

type DeepSearchMessageContent =
    | DeepSearchProgressMessageContent
    | DeepSearchDraftMessageContent
    | DeepSearchBooksMessageContent
    | DeepSearchReportMessageContent;

// 类型守卫函数
const isDeepSearchProgress = (content: unknown): content is DeepSearchProgressMessageContent => {
    return typeof content === 'object' && content !== null && (content as any).type === 'deep-search-progress';
};

const isDeepSearchDraft = (content: unknown): content is DeepSearchDraftMessageContent => {
    return typeof content === 'object' && content !== null && (content as any).type === 'deep-search-draft';
};

const isDeepSearchBooks = (content: unknown): content is DeepSearchBooksMessageContent => {
    return typeof content === 'object' && content !== null && (content as any).type === 'deep-search-books';
};

const isDeepSearchReport = (content: unknown): content is DeepSearchReportMessageContent => {
    return typeof content === 'object' && content !== null && (content as any).type === 'deep-search-report';
};

// 判断消息内容是否为深度检索类型
const isDeepSearchMessage = (content: unknown): content is DeepSearchMessageContent => {
    return isDeepSearchProgress(content) || isDeepSearchDraft(content) || isDeepSearchBooks(content) || isDeepSearchReport(content);
};

interface MessageStreamProps {
    messages: UIMessage[];
    isStreaming: boolean;
    isSearching?: boolean;
    retrievalPhase?: RetrievalPhase;
    selectedBookIds?: Set<string>;
    onBookSelection?: (bookId: string, isSelected: boolean) => void;
    onGenerateInterpretation?: (selectedBookIds: Set<string>) => void;
    onReenterSelection?: () => void;
    onSecondaryRetrieval?: (selectedBooks: BookInfo[], originalQuery: string) => void;
    originalQuery?: string;
    // 简单检索进度相关
    simpleSearchLogs?: LogEntry[];
    simpleSearchPhase?: string;
    // 深度检索回调
    onDeepSearchDraftChange?: (value: string) => void;
    onDeepSearchDraftConfirm?: () => void;
    onDeepSearchDraftRegenerate?: () => void;
    onDeepSearchDraftCancel?: () => void;
    onDeepSearchGenerateInterpretation?: (selectedBooks: BookInfo[], draftMarkdown: string) => void;
}

export default function MessageStream({
    messages,
    isStreaming,
    isSearching = false,
    retrievalPhase = 'search',
    selectedBookIds = new Set(),
    onBookSelection,
    onGenerateInterpretation,
    onReenterSelection,
    onSecondaryRetrieval,
    originalQuery = '',
    simpleSearchLogs = [],
    simpleSearchPhase = '',
    // 深度检索回调
    onDeepSearchDraftChange,
    onDeepSearchDraftConfirm,
    onDeepSearchDraftRegenerate,
    onDeepSearchDraftCancel,
    onDeepSearchGenerateInterpretation
}: MessageStreamProps) {
    const { retrievalResults, deepSearchPhase, deepSearchLogs } = useAIBotStore(); // 获取检索结果状态、深度检索阶段和日志

    // 判断报告是否正在生成或已完成（用于自动折叠图书列表）
    const isReportStartedOrCompleted = deepSearchPhase === 'report-streaming' || deepSearchPhase === 'completed';

    // 调试日志：检查容器尺寸和滚动状态
    useEffect(() => {
        if (process.env.NODE_ENV === 'development') {
            console.log('[MessageStream DEBUG]', {
                消息数量: messages.length,
                流式状态: isStreaming,
                总内容长度: messages.reduce((sum, msg) => sum + ((msg as any).content || '').length, 0),
                时间戳: new Date().toISOString(),
                检索结果数量: retrievalResults.size
            });
        }
    }, [messages, isStreaming, retrievalResults]);

    return (
        <div
            className="flex-1 overflow-y-auto pr-2 space-y-4 aibot-scroll"
            style={{
                maxHeight: '100%',
                minHeight: '0' // 确保flex子元素可以缩小
            }}
            onLoad={() => {
                if (process.env.NODE_ENV === 'development') {
                    console.log('[MessageStream DEBUG] 容器已加载');
                }
            }}
        >
            <AnimatePresence initial={false}>
                {messages.map((message) => (
                    <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={message.role === 'user' ? 'text-right' : 'text-left'}
                    >
                        {message.role === 'assistant' && (
                            <>
                                {/* 深度检索进度消息 */}
                                {isDeepSearchProgress((message as any).content) && (
                                    <DeepSearchProgressMessage
                                        logs={deepSearchLogs}
                                        currentPhase={(message as any).content.currentPhase}
                                    />
                                )}

                                {/* 深度检索草稿消息 */}
                                {isDeepSearchDraft((message as any).content) && (
                                    <DeepSearchDraftMessage
                                        draftMarkdown={(message as any).content.draftMarkdown}
                                        isStreaming={(message as any).content.isStreaming}
                                        isComplete={(message as any).content.isComplete}
                                        searchSnippets={(message as any).content.searchSnippets}
                                        keywords={(message as any).content.keywords}
                                        userInput={(message as any).content.userInput}
                                        onDraftChange={onDeepSearchDraftChange}
                                        onConfirm={onDeepSearchDraftConfirm}
                                        onRegenerate={onDeepSearchDraftRegenerate}
                                        onCancel={onDeepSearchDraftCancel}
                                    />
                                )}

                                {/* 深度检索图书列表消息 */}
                                {isDeepSearchBooks((message as any).content) && (
                                    <DeepSearchBookListMessage
                                        books={(message as any).content.books}
                                        draftMarkdown={(message as any).content.draftMarkdown}
                                        userInput={(message as any).content.userInput}
                                        onGenerateInterpretation={onDeepSearchGenerateInterpretation}
                                        autoCollapseOnReportStart={isReportStartedOrCompleted}
                                    />
                                )}

                                {/* 深度检索解读报告消息 */}
                                {/* 使用 key 强制隔离流式更新，防止 AnimatePresence 与 ReactMarkdown 的 DOM 冲突 */}
                                {isDeepSearchReport((message as any).content) && (
                                    <div
                                        className="bg-[#1B1B1B] border border-[#343434] rounded-xl p-4"
                                        key={`report-container-${message.id}`}
                                    >
                                        {/* 稳定容器：阻止 AnimatePresence 追踪 ReactMarkdown 内部 DOM 变化 */}
                                        <div
                                            className="prose prose-invert prose-sm max-w-none"
                                            suppressHydrationWarning
                                            key={`report-markdown-${message.id}`}
                                        >
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={messageMarkdownComponents}
                                            >
                                                {(message as any).content.reportMarkdown || ''}
                                            </ReactMarkdown>
                                        </div>
                                        {(message as any).content.isStreaming && (
                                            <span className="inline-block w-2 h-4 bg-[#C9A063] animate-pulse ml-1"></span>
                                        )}
                                    </div>
                                )}

                                {/* 检索结果显示（简单检索） */}
                                {retrievalResults.get(message.id) && !isDeepSearchMessage((message as any).content) && (
                                    <RetrievalResultDisplay
                                        retrievalResult={retrievalResults.get(message.id)!}
                                        mode={retrievalPhase === 'selection' ? 'selection' : 'display'}
                                        selectedBookIds={selectedBookIds}
                                        onSelectionChange={onBookSelection}
                                        onGenerateInterpretation={onGenerateInterpretation}
                                        onReenterSelection={onReenterSelection}
                                        onSecondaryRetrieval={onSecondaryRetrieval}
                                        originalQuery={originalQuery}
                                    />
                                )}
                            </>
                        )}
                        
                        {/* 只有当消息内容不为空且不是深度检索类型时才显示气泡 */}
                        {/* 使用 suppressHydrationWarning 和稳定容器防止 AnimatePresence 与 ReactMarkdown 的 DOM 冲突 */}
                        {(message as any).content && !isDeepSearchMessage((message as any).content) && (
                            <div
                                className={`inline-block rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap font-info-content ${
                                    message.role === 'user'
                                        ? 'bg-[#2F2F2F] text-[#E8E6DC]'
                                        : 'bg-[#1B1B1B] border border-[#343434] text-[#E8E6DC]'
                                }`}
                            >
                                {message.role === 'assistant' ? (
                                    // 稳定容器：阻止 AnimatePresence 追踪 ReactMarkdown 内部 DOM 变化
                                    <div suppressHydrationWarning>
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={messageMarkdownComponents}
                                        >
                                            {(message as any).content}
                                        </ReactMarkdown>
                                    </div>
                                ) : (
                                    (message as any).content
                                )}
                            </div>
                        )}
                    </motion.div>
                ))}
            </AnimatePresence>

            {/* 简单检索进度显示 */}
            {isSearching && simpleSearchLogs.length > 0 && (
                <ProgressLogDisplay
                    isVisible={true}
                    logs={simpleSearchLogs}
                    currentPhase={simpleSearchPhase}
                    title="检索进度"
                />
            )}

            {isStreaming && (
                <div className="text-left text-xs text-[#A2A09A] animate-pulse">
                    正在生成中，请稍候...
                </div>
            )}
        </div>
    );
}
