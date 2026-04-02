'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';
import type { Message as UIMessage } from '@ai-sdk/ui-utils';
import RetrievalResultDisplay from './RetrievalResultDisplay';
import ProgressLogDisplay from './ProgressLogDisplay';
import DeepSearchProgressMessage from './DeepSearchProgressMessage';
import DeepSearchDraftMessage from './DeepSearchDraftMessage';
import DeepSearchBookListMessage from './DeepSearchBookListMessage';
import DocumentAnalysisProgressMessage from './DocumentAnalysisProgressMessage';
import DocumentAnalysisDraftMessage from './DocumentAnalysisDraftMessage';
import type { LogEntry } from './ProgressLogDisplay';
import { messageMarkdownComponents } from '@/lib/markdownComponents';
import { useAIBotStore } from '@/store/aibot/useAIBotStore';
import type {
    RetrievalPhase,
    BookInfo,
    DeepSearchLogEntry,
    KeywordResult,
    DuckDuckGoSnippet,
    DocumentAnalysisMessageContent,
    DocumentAnalysisProgressContent,
    DocumentAnalysisDraftContent,
    DocumentAnalysisBooksContent,
    DocumentAnalysisReportContent
} from '@/src/core/aibot/types';

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

// 文档分析消息类型守卫函数
const isDocumentAnalysisProgress = (content: unknown): content is DocumentAnalysisProgressContent => {
    return typeof content === 'object' && content !== null && (content as any).type === 'document-analysis-progress';
};

const isDocumentAnalysisDraft = (content: unknown): content is DocumentAnalysisDraftContent => {
    return typeof content === 'object' && content !== null && (content as any).type === 'document-analysis-draft';
};

const isDocumentAnalysisBooks = (content: unknown): content is DocumentAnalysisBooksContent => {
    return typeof content === 'object' && content !== null && (content as any).type === 'document-analysis-books';
};

const isDocumentAnalysisReport = (content: unknown): content is DocumentAnalysisReportContent => {
    return typeof content === 'object' && content !== null && (content as any).type === 'document-analysis-report';
};

// 判断消息内容是否为深度检索类型
const isDeepSearchMessage = (content: unknown): content is DeepSearchMessageContent => {
    return isDeepSearchProgress(content) || isDeepSearchDraft(content) || isDeepSearchBooks(content) || isDeepSearchReport(content);
};

// 判断消息内容是否为文档分析类型
const isDocumentAnalysisMessage = (content: unknown): content is DocumentAnalysisMessageContent => {
    return isDocumentAnalysisProgress(content) || isDocumentAnalysisDraft(content) || isDocumentAnalysisBooks(content) || isDocumentAnalysisReport(content);
};

// 清理 markdown 代码块包裹（LLM 可能返回 ```markdown ... ``` 格式）
const cleanMarkdownCodeBlock = (content: string): string => {
    const codeBlockPattern = /^```(?:markdown|md)?\s*\n?([\s\S]*?)\n?```\s*$/;
    const match = content.trim().match(codeBlockPattern);
    return match ? match[1].trim() : content;
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
    // 文档分析回调
    onDocumentAnalysisDraftChange?: (value: string) => void;
    onDocumentAnalysisDraftConfirm?: () => void;
    onDocumentAnalysisDraftRegenerate?: () => void;
    onDocumentAnalysisDraftCancel?: () => void;
    onDocumentAnalysisGenerateInterpretation?: (selectedBooks: BookInfo[], draftMarkdown: string) => void;
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
    onDeepSearchGenerateInterpretation,
    // 文档分析回调
    onDocumentAnalysisDraftChange,
    onDocumentAnalysisDraftConfirm,
    onDocumentAnalysisDraftRegenerate,
    onDocumentAnalysisDraftCancel,
    onDocumentAnalysisGenerateInterpretation
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
            className="aibot-scroll flex-1 space-y-5 overflow-y-auto pr-2"
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
                        transition={{ duration: 0.24, ease: 'easeOut' }}
                        className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
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
                                    <div key={`draft-container-${message.id}`}>
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
                                    </div>
                                )}

                                {/* 深度检索图书列表消息 */}
                                {isDeepSearchBooks((message as any).content) && (
                                    <DeepSearchBookListMessage
                                        books={(message as any).content.books}
                                        draftMarkdown={(message as any).content.draftMarkdown}
                                        userInput={(message as any).content.userInput}
                                        onGenerateInterpretation={onDeepSearchGenerateInterpretation}
                                        onSecondaryRetrieval={onSecondaryRetrieval}
                                        autoCollapseOnReportStart={isReportStartedOrCompleted}
                                    />
                                )}

                                {/* 文档分析进度消息 */}
                                {isDocumentAnalysisProgress((message as any).content) && (
                                    <DocumentAnalysisProgressMessage
                                        content={(message as any).content}
                                    />
                                )}

                                {/* 文档分析草稿消息 */}
                                {isDocumentAnalysisDraft((message as any).content) && (
                                    <div key={`document-draft-container-${message.id}`}>
                                        <DocumentAnalysisDraftMessage
                                            content={(message as any).content}
                                            onDraftChange={onDocumentAnalysisDraftChange || (() => {})}
                                            onDraftConfirm={onDocumentAnalysisDraftConfirm || (() => {})}
                                            onDraftRegenerate={onDocumentAnalysisDraftRegenerate || (() => {})}
                                            onDraftCancel={onDocumentAnalysisDraftCancel || (() => {})}
                                        />
                                    </div>
                                )}

                                {/* 文档分析图书列表消息 - 复用深度检索的图书列表组件 */}
                                {isDocumentAnalysisBooks((message as any).content) && (
                                    <DeepSearchBookListMessage
                                        books={(message as any).content.books}
                                        draftMarkdown={(message as any).content.draftMarkdown}
                                        userInput={(message as any).content.userInput}
                                        onGenerateInterpretation={onDocumentAnalysisGenerateInterpretation}
                                        onSecondaryRetrieval={onSecondaryRetrieval}
                                        autoCollapseOnReportStart={false} // 文档分析暂不使用自动折叠
                                    />
                                )}

                                {/* 文档分析解读报告消息 */}
                                {isDocumentAnalysisReport((message as any).content) && (
                                    <div
                                        className="aibot-workflow-card max-w-[min(100%,56rem)]"
                                        key={`document-report-container-${message.id}`}
                                    >
                                        <div className="aibot-workflow-header">
                                            <div className="flex items-center gap-3">
                                                <span className="h-2 w-2 rounded-full bg-[#C9A063] shadow-[0_0_16px_rgba(201,160,99,0.42)]" />
                                                <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#C9A063]/75">analysis report</span>
                                            </div>
                                            {(message as any).content.isStreaming && (
                                                <span className="aibot-chip aibot-chip--active">生成中</span>
                                            )}
                                        </div>
                                        <div className="aibot-workflow-body">
                                            <div
                                                className="prose prose-invert prose-sm max-w-none font-info-content"
                                                suppressHydrationWarning
                                                key={`document-report-markdown-${message.id}`}
                                            >
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={messageMarkdownComponents}
                                                >
                                                    {cleanMarkdownCodeBlock((message as any).content.reportMarkdown || '')}
                                                </ReactMarkdown>
                                            </div>
                                            {(message as any).content.isStreaming && (
                                                <span className="mt-2 inline-block h-4 w-2 animate-pulse rounded-full bg-[#C9A063] align-middle"></span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* 深度检索解读报告消息 */}
                                {/* 支持两种方式：对象结构（旧）和字符串内容（新，与简单检索一致） */}
                                {/* 修复：在 report-streaming 和 completed 阶段都渲染报告样式 */}
                                {(isDeepSearchReport((message as any).content) ||
                                  ((deepSearchPhase === 'report-streaming' || deepSearchPhase === 'completed') &&
                                   typeof (message as any).content === 'string' && (message as any).content &&
                                   // 确保是最后一条助手消息（报告消息）
                                   messages.filter(m => m.role === 'assistant').slice(-1)[0]?.id === message.id)) && (
                                    <div
                                        className="aibot-workflow-card max-w-[min(100%,56rem)]"
                                        key={`report-container-${message.id}`}
                                    >
                                        <div className="aibot-workflow-header">
                                            <div className="flex items-center gap-3">
                                                <span className="h-2 w-2 rounded-full bg-[#C9A063] shadow-[0_0_16px_rgba(201,160,99,0.42)]" />
                                                <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#C9A063]/75">deep report</span>
                                            </div>
                                            {((typeof (message as any).content === 'object' && (message as any).content.isStreaming) ||
                                              (deepSearchPhase === 'report-streaming' && typeof (message as any).content === 'string')) && (
                                                <span className="aibot-chip aibot-chip--active">生成中</span>
                                            )}
                                        </div>
                                        <div className="aibot-workflow-body">
                                            {/* 稳定容器：阻止 AnimatePresence 追踪 ReactMarkdown 内部 DOM 变化 */}
                                            <div
                                                className="prose prose-invert prose-sm max-w-none font-info-content"
                                                suppressHydrationWarning
                                                key={`report-markdown-${message.id}`}
                                            >
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={messageMarkdownComponents}
                                                >
                                                    {/* 新方式：直接使用字符串内容（与简单检索一致），清理可能的代码块包裹 */}
                                                    {typeof (message as any).content === 'string'
                                                        ? cleanMarkdownCodeBlock((message as any).content)
                                                        : cleanMarkdownCodeBlock((message as any).content.reportMarkdown || '')}
                                                </ReactMarkdown>
                                            </div>
                                            {/* 显示流式输出的光标 */}
                                            {((typeof (message as any).content === 'object' && (message as any).content.isStreaming) ||
                                              (deepSearchPhase === 'report-streaming' && typeof (message as any).content === 'string')) && (
                                                <span className="mt-2 inline-block h-4 w-2 animate-pulse rounded-full bg-[#C9A063] align-middle"></span>
                                            )}
                                        </div>
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
                        
                        {/* 只有当消息内容不为空且不是深度检索类型和文档分析类型时才显示气泡 */}
                        {/* 使用 suppressHydrationWarning 和稳定容器防止 AnimatePresence 与 ReactMarkdown 的 DOM 冲突 */}
                        {/* 修复：排除深度检索报告阶段的最后一条助手消息，避免重复渲染 */}
                        {/* 修复：排除文档分析消息，其内容为对象而非字符串 */}
                        {(message as any).content && !isDeepSearchMessage((message as any).content) && !isDocumentAnalysisMessage((message as any).content) &&
                         // 排除深度检索报告消息（在 report-streaming 或 completed 阶段的最后一条助手消息）
                         !((deepSearchPhase === 'report-streaming' || deepSearchPhase === 'completed') &&
                           message.role === 'assistant' &&
                           typeof (message as any).content === 'string' &&
                           messages.filter(m => m.role === 'assistant').slice(-1)[0]?.id === message.id) && (
                            <div
                                className={clsx(
                                    'max-w-[min(100%,56rem)] overflow-hidden',
                                    message.role === 'user' ? 'rounded-[1.5rem] border border-[#E8E6DC]/10 bg-[#24211D] px-4 py-3 text-[#F4EAD8] shadow-[0_14px_30px_rgba(0,0,0,0.18)] md:px-5' : 'aibot-workflow-card'
                                )}
                            >
                                {message.role === 'assistant' ? (
                                    // 稳定容器：阻止 AnimatePresence 追踪 ReactMarkdown 内部 DOM 变化
                                    <div className="aibot-workflow-body" suppressHydrationWarning>
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={messageMarkdownComponents}
                                        >
                                            {(message as any).content}
                                        </ReactMarkdown>
                                    </div>
                                ) : (
                                    <div className="text-sm leading-7 whitespace-pre-wrap font-info-content">{(message as any).content}</div>
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
