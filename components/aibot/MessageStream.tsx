'use client';

import { AnimatePresence, motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message as UIMessage } from '@ai-sdk/ui-utils';
import UnifiedProgressMessage from './messages/UnifiedProgressMessage';
import UnifiedDraftMessage from './messages/UnifiedDraftMessage';
import UnifiedBookSelection from './messages/UnifiedBookSelection';
import UnifiedReportMessage from './messages/UnifiedReportMessage';
import type { ProgressLogInput } from './messages/UnifiedProgressMessage';
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
    simpleSearchLogs?: ProgressLogInput[];
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
    const { retrievalResults } = useAIBotStore();
    const firstUserMessageId = messages.find((message) => message.role === 'user')?.id;
    const lastAssistantMessageId = messages.filter((message) => message.role === 'assistant').slice(-1)[0]?.id;
    const shouldShowSimpleSearchLogs =
        simpleSearchLogs.length > 0 &&
        messages.length > 0 &&
        !messages.some((message) => message.role === 'assistant' && isDeepSearchMessage(getMessageContent(message))) &&
        !messages.some((message) => message.role === 'assistant' && isDocumentAnalysisMessage(getMessageContent(message)));

    return (
        <div
            className="flex-1 overflow-y-auto pr-1 space-y-4 about-overlay-scroll"
            style={{
                maxHeight: '100%',
                minHeight: '0'
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
                                    {isDeepSearchProgress(content) && (
                                        <UnifiedProgressMessage
                                            logs={content.logs}
                                            title="深度检索进度"
                                            currentPhase={content.currentPhase}
                                        />
                                    )}

                                    {/* 深度检索草稿消息 */}
                                    {isDeepSearchDraft(content) && (
                                        <UnifiedDraftMessage
                                            title="📝 检索草稿"
                                            draftMarkdown={content.draftMarkdown}
                                            isStreaming={content.isStreaming}
                                            isComplete={content.isComplete}
                                            searchSnippets={content.searchSnippets}
                                            keywords={content.keywords}
                                            userInput={content.userInput}
                                            onDraftChange={onDeepSearchDraftChange}
                                            onConfirm={onDeepSearchDraftConfirm}
                                            onRegenerate={onDeepSearchDraftRegenerate}
                                            onCancel={onDeepSearchDraftCancel}
                                        />
                                    )}

                                    {/* 深度检索图书列表消息 */}
                                    {isDeepSearchBooks(content) && (
                                        <UnifiedBookSelection
                                            books={content.books}
                                            draftMarkdown={content.draftMarkdown}
                                            userInput={content.userInput}
                                            onGenerateInterpretation={(books) =>
                                                onDeepSearchGenerateInterpretation?.(books, content.draftMarkdown)
                                            }
                                            onSecondaryRetrieval={onSecondaryRetrieval}
                                        />
                                    )}

                                    {/* 文档分析进度消息 */}
                                    {isDocumentAnalysisProgress(content) && (
                                        <UnifiedProgressMessage
                                            logs={content.logs}
                                            title="文档分析进度"
                                            currentPhase={content.currentPhase}
                                        />
                                    )}

                                    {/* 文档分析草稿消息 */}
                                    {isDocumentAnalysisDraft(content) && (
                                        <UnifiedDraftMessage
                                            title="📝 交叉分析报告"
                                            draftMarkdown={content.draftMarkdown}
                                            isStreaming={content.isStreaming}
                                            isComplete={content.isComplete}
                                            documents={content.documentAnalyses}
                                            userInput={content.userInput}
                                            onDraftChange={onDocumentAnalysisDraftChange}
                                            onConfirm={onDocumentAnalysisDraftConfirm}
                                            onRegenerate={onDocumentAnalysisDraftRegenerate}
                                            onCancel={onDocumentAnalysisDraftCancel}
                                        />
                                    )}

                                    {/* 文档分析图书列表消息 */}
                                    {isDocumentAnalysisBooks(content) && (
                                        <UnifiedBookSelection
                                            books={content.books}
                                            draftMarkdown={content.draftMarkdown}
                                            userInput={content.userInput}
                                            autoCollapseOnReportStart={false}
                                            onGenerateInterpretation={(books) =>
                                                onDocumentAnalysisGenerateInterpretation?.(books, content.draftMarkdown)
                                            }
                                            onSecondaryRetrieval={onSecondaryRetrieval}
                                        />
                                    )}

                                    {/* 文档分析解读报告消息 */}
                                    {isDocumentAnalysisReport(content) && (
                                        <UnifiedReportMessage
                                            reportMarkdown={content.reportMarkdown}
                                            isStreaming={content.isStreaming}
                                            isComplete={content.isComplete}
                                            selectedBooks={content.selectedBooks}
                                            onSecondaryRetrieval={onSecondaryRetrieval}
                                        />
                                    )}

                                    {/* 深度检索解读报告消息 */}
                                    {(isDeepSearchReport(content) ||
                                        (typeof content === 'string' &&
                                            content &&
                                            message.id === lastAssistantMessageId)) && (
                                        <UnifiedReportMessage
                                            reportMarkdown={typeof content === 'string' ? content : content.reportMarkdown}
                                            isStreaming={typeof content === 'object' ? content.isStreaming : isStreaming}
                                            isComplete={typeof content === 'object' ? content.isComplete : !isStreaming}
                                            selectedBooks={typeof content === 'object' ? content.selectedBooks : []}
                                            onSecondaryRetrieval={onSecondaryRetrieval}
                                        />
                                    )}

                                    {/* 检索结果显示（简单检索） */}
                                    {retrievalResults.get(message.id) && !isDeepSearchMessage(content) && (
                                        <UnifiedBookSelection
                                            books={retrievalResults.get(message.id)!.books}
                                            mode={retrievalPhase === 'selection' ? 'selection' : 'display'}
                                            selectedBookIds={selectedBookIds}
                                            userInput={originalQuery}
                                            onBookSelectionChange={onBookSelection}
                                            onGenerateInterpretation={() => {
                                                onGenerateInterpretation?.(selectedBookIds);
                                            }}
                                            onReenterSelection={onReenterSelection}
                                            onSecondaryRetrieval={onSecondaryRetrieval}
                                        />
                                    )}
                                </>
                            )}

                            {/* 纯文本气泡（用户提问或普通对话回答） */}
                            {hasContent &&
                                !isDeepSearchMessage(content) &&
                                !isDocumentAnalysisMessage(content) &&
                                !(message.role === 'assistant' &&
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

                            {/* 简单检索进度条 */}
                            {message.role === 'user' &&
                                message.id === firstUserMessageId &&
                                shouldShowSimpleSearchLogs && (
                                    <div className="mt-4 text-left">
                                        <UnifiedProgressMessage
                                            isVisible={true}
                                            logs={simpleSearchLogs}
                                            title="检索进度"
                                            currentPhase={simpleSearchPhase}
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
                        <div className="w-2 h-2 border border-[#C9A063] border-t-transparent animate-spin"></div>
                        正在生成中，请稍候...
                    </div>
                </div>
            )}
        </div>
    );
}
