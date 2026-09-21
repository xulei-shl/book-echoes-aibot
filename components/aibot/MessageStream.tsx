'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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

/** UIMessage 的 content 在 SDK 中声明为 string，实际会承载结构化消息对象 */
const getMessageContent = (message: UIMessage): unknown => (message as { content?: unknown }).content;

type ContentTypeCarrier = { type?: unknown };

// 类型守卫函数
const isDeepSearchProgress = (content: unknown): content is DeepSearchProgressMessageContent => {
    return typeof content === 'object' && content !== null && (content as ContentTypeCarrier).type === 'deep-search-progress';
};

const isDeepSearchDraft = (content: unknown): content is DeepSearchDraftMessageContent => {
    return typeof content === 'object' && content !== null && (content as ContentTypeCarrier).type === 'deep-search-draft';
};

const isDeepSearchBooks = (content: unknown): content is DeepSearchBooksMessageContent => {
    return typeof content === 'object' && content !== null && (content as ContentTypeCarrier).type === 'deep-search-books';
};

const isDeepSearchReport = (content: unknown): content is DeepSearchReportMessageContent => {
    return typeof content === 'object' && content !== null && (content as ContentTypeCarrier).type === 'deep-search-report';
};

// 文档分析消息类型守卫函数
const isDocumentAnalysisProgress = (content: unknown): content is DocumentAnalysisProgressContent => {
    return typeof content === 'object' && content !== null && (content as ContentTypeCarrier).type === 'document-analysis-progress';
};

const isDocumentAnalysisDraft = (content: unknown): content is DocumentAnalysisDraftContent => {
    return typeof content === 'object' && content !== null && (content as ContentTypeCarrier).type === 'document-analysis-draft';
};

const isDocumentAnalysisBooks = (content: unknown): content is DocumentAnalysisBooksContent => {
    return typeof content === 'object' && content !== null && (content as ContentTypeCarrier).type === 'document-analysis-books';
};

const isDocumentAnalysisReport = (content: unknown): content is DocumentAnalysisReportContent => {
    return typeof content === 'object' && content !== null && (content as ContentTypeCarrier).type === 'document-analysis-report';
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

interface MessageStreamProps {
    messages: UIMessage[];
    isStreaming: boolean;
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
    const firstUserMessageId = messages.find((message) => message.role === 'user')?.id;
    const lastAssistantMessageId = messages.filter((message) => message.role === 'assistant').slice(-1)[0]?.id;
    const shouldShowSimpleSearchLogs =
        simpleSearchLogs.length > 0 &&
        messages.length > 0 &&
        !messages.some((message) => message.role === 'assistant' && isDeepSearchMessage(getMessageContent(message))) &&
        !messages.some((message) => message.role === 'assistant' && isDocumentAnalysisMessage(getMessageContent(message)));

    // 判断报告是否正在生成或已完成（用于自动折叠图书列表）
    const isReportStartedOrCompleted = deepSearchPhase === 'report-streaming' || deepSearchPhase === 'completed';

    // 调试日志：检查容器尺寸和滚动状态
    useEffect(() => {
        if (process.env.NODE_ENV === 'development') {
            console.log('[MessageStream DEBUG]', {
                消息数量: messages.length,
                流式状态: isStreaming,
                总内容长度: messages.reduce((sum, msg) => {
                    const content = getMessageContent(msg);
                    return sum + (typeof content === 'string' ? content.length : 0);
                }, 0),
                时间戳: new Date().toISOString(),
                检索结果数量: retrievalResults.size
            });
        }
    }, [messages, isStreaming, retrievalResults]);

    return (
        <div
            className="flex-1 overflow-y-auto pr-1 space-y-4 about-overlay-scroll"
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
                {messages.map((message) => {
                    const content = getMessageContent(message);
                    const textContent = typeof content === 'string' ? content : '';
                    const hasContent = content !== null && content !== undefined && content !== '';

                    return (
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
                                {isDeepSearchProgress(content) && (                                        <DeepSearchProgressMessage
                                            logs={deepSearchLogs}
                                        />
                                )}

                                {/* 深度检索草稿消息 */}
                                {isDeepSearchDraft(content) && (
                                    <div key={`draft-container-${message.id}`}>
                                        <DeepSearchDraftMessage
                                            draftMarkdown={content.draftMarkdown}
                                            isStreaming={content.isStreaming}
                                            isComplete={content.isComplete}
                                            searchSnippets={content.searchSnippets}
                                            keywords={content.keywords}
                                            onDraftChange={onDeepSearchDraftChange}
                                            onConfirm={onDeepSearchDraftConfirm}
                                            onRegenerate={onDeepSearchDraftRegenerate}
                                            onCancel={onDeepSearchDraftCancel}
                                        />
                                    </div>
                                )}

                                {/* 深度检索图书列表消息 */}
                                {isDeepSearchBooks(content) && (
                                    <DeepSearchBookListMessage
                                        books={content.books}
                                        draftMarkdown={content.draftMarkdown}
                                        userInput={content.userInput}
                                        onGenerateInterpretation={onDeepSearchGenerateInterpretation}
                                        onSecondaryRetrieval={onSecondaryRetrieval}
                                        autoCollapseOnReportStart={isReportStartedOrCompleted}
                                    />
                                )}

                                {/* 文档分析进度消息 */}
                                {isDocumentAnalysisProgress(content) && (
                                    <DocumentAnalysisProgressMessage
                                        content={content}
                                    />
                                )}

                                {/* 文档分析草稿消息 */}
                                {isDocumentAnalysisDraft(content) && (
                                    <div key={`document-draft-container-${message.id}`}>
                                        <DocumentAnalysisDraftMessage
                                            content={content}
                                            onDraftChange={onDocumentAnalysisDraftChange || (() => {})}
                                            onDraftConfirm={onDocumentAnalysisDraftConfirm || (() => {})}
                                            onDraftRegenerate={onDocumentAnalysisDraftRegenerate || (() => {})}
                                            onDraftCancel={onDocumentAnalysisDraftCancel || (() => {})}
                                        />
                                    </div>
                                )}

                                {/* 文档分析图书列表消息 - 复用深度检索的图书列表组件 */}
                                {isDocumentAnalysisBooks(content) && (
                                    <DeepSearchBookListMessage
                                        books={content.books}
                                        draftMarkdown={content.draftMarkdown}
                                        userInput={content.userInput}
                                        onGenerateInterpretation={onDocumentAnalysisGenerateInterpretation}
                                        onSecondaryRetrieval={onSecondaryRetrieval}
                                        autoCollapseOnReportStart={false} // 文档分析暂不使用自动折叠
                                    />
                                )}

                                {/* 文档分析解读报告消息 */}
                                {isDocumentAnalysisReport(content) && (
                                    <div
                                        className="bg-[#1a1a1a]/80 border border-[#C9A063]/20 p-4"
                                        key={`document-report-container-${message.id}`}
                                    >
                                        <div
                                            className="prose prose-invert prose-sm max-w-none font-info-content"
                                            suppressHydrationWarning
                                            key={`document-report-markdown-${message.id}`}
                                        >
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={messageMarkdownComponents}
                                            >
                                                {cleanMarkdownCodeBlock(content.reportMarkdown || '')}
                                            </ReactMarkdown>
                                        </div>
                                        {content.isStreaming && (
                                            <span className="inline-block w-2 h-4 bg-[#C9A063] animate-pulse ml-1"></span>
                                        )}
                                    </div>
                                )}

                                {/* 深度检索解读报告消息 */}
                                {/* 支持两种方式：对象结构（旧）和字符串内容（新，与简单检索一致） */}
                                {/* 修复：在 report-streaming 和 completed 阶段都渲染报告样式 */}
                                {(isDeepSearchReport(content) ||
                                  ((deepSearchPhase === 'report-streaming' || deepSearchPhase === 'completed') &&
                                   typeof content === 'string' && content &&
                                   // 确保是最后一条助手消息（报告消息）
                                   message.id === lastAssistantMessageId)) && (
                                    <div
                                        className="bg-[#1a1a1a]/80 border border-[#C9A063]/20 p-4"
                                        key={`report-container-${message.id}`}
                                    >
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
                                                {typeof content === 'string'
                                                    ? cleanMarkdownCodeBlock(content)
                                                    : cleanMarkdownCodeBlock(content.reportMarkdown || '')}
                                            </ReactMarkdown>
                                        </div>
                                        {/* 显示流式输出的光标 */}
                                        {((typeof content === 'object' && content.isStreaming) ||
                                          (deepSearchPhase === 'report-streaming' && typeof content === 'string')) && (
                                            <span className="inline-block w-2 h-4 bg-[#C9A063] animate-pulse ml-1"></span>
                                        )}
                                    </div>
                                )}

                                {/* 检索结果显示（简单检索） */}
                                {retrievalResults.get(message.id) && !isDeepSearchMessage(content) && (
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
                        {hasContent && !isDeepSearchMessage(content) && !isDocumentAnalysisMessage(content) &&
                         // 排除深度检索报告消息（在 report-streaming 或 completed 阶段的最后一条助手消息）
                         !((deepSearchPhase === 'report-streaming' || deepSearchPhase === 'completed') &&
                           message.role === 'assistant' &&
                           typeof content === 'string' &&
                           message.id === lastAssistantMessageId) && (
                            <div
                                className={`inline-block px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap font-info-content border ${
                                    message.role === 'user'
                                        ? 'bg-[#111111]/80 border-[#C9A063]/20 text-[#E8E6DC]'
                                        : 'bg-[#1a1a1a]/80 border-[#C9A063]/20 text-[#E8E6DC]'
                                }`}
                            >
                                {message.role === 'assistant' ? (
                                    // 稳定容器：阻止 AnimatePresence 追踪 ReactMarkdown 内部 DOM 变化
                                    <div suppressHydrationWarning>
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={messageMarkdownComponents}
                                        >
                                            {textContent}
                                        </ReactMarkdown>
                                    </div>
                                ) : (
                                    textContent
                                )}
                            </div>
                        )}

                        {message.role === 'user' && message.id === firstUserMessageId && shouldShowSimpleSearchLogs && (
                            <div className="mt-4 text-left">
                                <ProgressLogDisplay
                                    isVisible={true}
                                    logs={simpleSearchLogs}
                                    currentPhase={simpleSearchPhase}
                                    title="检索进度"
                                />
                            </div>
                        )}
                    </motion.div>
                    );
                })}
            </AnimatePresence>

            {isStreaming && (
                <div className="text-left">
                    <div className="mt-4 flex items-center gap-2 text-sm font-mono tracking-wider text-[#C9A063]/70 animate-pulse">
                        <div className="w-3 h-3 border border-[#C9A063] border-t-transparent animate-spin"></div>
                        正在生成中，请稍候...
                    </div>
                </div>
            )}
        </div>
    );
}
