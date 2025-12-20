import type { AIBotIntent, AIBotMode } from '@/src/core/aibot/constants';
import type { LLMConfig } from '@/src/utils/aibot-env';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
    id?: string;
    role: ChatRole;
    content: string;
}

export interface DuckDuckGoSnippet {
    title: string;
    url: string;
    snippet: string;
    raw?: unknown;
}

export interface DraftPayload {
    userInput: string;
    searchSnippets: DuckDuckGoSnippet[];
    articleAnalysis: string;
    crossAnalysis: string;
    draftMarkdown: string;
}

export interface RetrievalResult<TMetadata = Record<string, unknown>> {
    contextPlainText: string;
    metadata: TMetadata;
}

export type DraftWorkflowResult = DraftPayload;

export interface ChatWorkflowInput {
    mode: AIBotMode;
    messages: ChatMessage[];
    draftMarkdown?: string;
    deepMetadata?: DraftPayload;
}

export interface ChatWorkflowContext {
    mode: AIBotMode;
    systemPrompt: string;
    contextPlainText: string;
    metadata: Record<string, unknown>;
    llmConfig: LLMConfig;
}

export interface DuckDuckGoOptions {
    topK?: number;
    locale?: string;
}

// ========== Jina AI 搜索相关类型 ==========

// Jina 搜索选项
export interface JinaSearchOptions {
    topK?: number;         // 返回结果数量
    locale?: string;       // 搜索地区
    site?: string;         // 限定搜索域名
    withContent?: boolean; // 是否获取全文内容
}

// 统一网络搜索结果类型（兼容 DuckDuckGo 和 Jina）
export interface WebSearchSnippet {
    title: string;
    url: string;
    snippet: string;       // 摘要
    content?: string;      // 全文（可选）
    source: 'jina' | 'duckduckgo';
    raw?: unknown;
}

export interface TextSearchPayload {
    query: string;
    top_k?: number;
    min_rating?: number;
    response_format?: 'json' | 'plain_text';
    plain_text_template?: string;
}

export interface MultiQueryPayload {
    markdown_text: string;
    per_query_top_k?: number;
    final_top_k?: number;
    min_rating?: number;
    enable_rerank?: boolean;
    disable_exact_match?: boolean;
    response_format?: 'json' | 'plain_text';
    plain_text_template?: string;
}

export interface IntentClassificationResult {
    intent: AIBotIntent;
    confidence: number;
    reason?: string;
    suggestedQuery?: string;
    source: 'llm' | 'rule';
    rawOutput?: string;
}

export interface IntentClassifierInput {
    userInput: string;
    messages?: ChatMessage[];
}

// 图书信息结构
export interface BookInfo {
    id: string;
    title: string;
    subtitle?: string;
    author: string;
    translator?: string;
    publisher?: string;
    publishYear?: number;
    rating?: number;
    callNumber?: string;
    pageCount?: number;
    coverUrl?: string;
    description?: string;
    authorIntro?: string;
    tableOfContents?: string;
    highlights?: string[];
    isbn?: string;
    tags?: string[];
    // API返回的评分相关字段
    fusedScore?: number;
    similarityScore?: number;
    rerankerScore?: number;
    finalScore?: number;
    // API返回的其他字段
    matchSource?: string;
    embeddingId?: string;
    sourceQueryType?: string;
}

// 检索结果数据结构
export interface RetrievalResultData {
    books: BookInfo[];
    totalCount: number;
    searchQuery: string;
    searchType: 'text-search' | 'multi-query';
    metadata: Record<string, unknown>;
    timestamp: string;
}

// 扩展的RetrievalResult
export interface EnhancedRetrievalResult<TMetadata = Record<string, unknown>> extends RetrievalResult<TMetadata> {
    structuredData?: RetrievalResultData;
}

// 检索流程阶段
export type RetrievalPhase = 'search' | 'selection' | 'interpretation' | 'completed';

// 图书选择状态
export interface BookSelectionState {
    selectedBookIds: Set<string>;
    currentRetrievalResult?: RetrievalResultData;
    originalQuery: string;
    phase: RetrievalPhase;
    isGeneratingInterpretation: boolean;
}

// 解读生成请求
export interface GenerateInterpretationRequest {
    originalQuery: string;
    selectedBooks: BookInfo[];
    messages?: ChatMessage[];
}

// 检索专用请求
export interface SearchOnlyRequest {
    query: string;
    messages?: ChatMessage[];
}

// 检索专用响应
export interface SearchOnlyResponse {
    success: boolean;
    query: string;
    retrievalResult?: RetrievalResultData;
    contextPlainText: string;
    metadata: Record<string, unknown>;
    message?: string;
}

// ========== 查询扩展相关类型 ==========

// 扩展探针
export interface ExpandedProbe {
    type: string;       // 探针类型：definitional, contextual, associative
    label: string;      // 探针标签
    text: string;       // 探针文本内容
}

// 查询扩展结果
export interface QueryExpansionResult {
    originalQuery: string;           // 原始查询
    expandedProbes: ExpandedProbe[]; // 扩展探针列表
    success: boolean;                // 扩展是否成功
    error?: string;                  // 错误信息
    duration?: number;               // 扩展耗时(ms)
}

// 并行检索单个结果
export interface ParallelSearchResult {
    query: string;                   // 检索查询
    books: BookInfo[];               // 检索到的图书
    success: boolean;                // 是否成功
    error?: string;                  // 错误信息
    duration?: number;               // 检索耗时(ms)
}

// 扩展检索聚合结果
export interface ExpandedSearchResult {
    originalQuery: string;           // 原始查询
    expansion: QueryExpansionResult; // 扩展结果
    parallelResults: ParallelSearchResult[]; // 并行检索结果
    mergedBooks: BookInfo[];         // 去重合并后的图书
    totalDuration: number;           // 总耗时(ms)
    success: boolean;                // 整体是否成功
}

// ========== 深度检索对话式消息类型 ==========

// 深度检索消息类型标识
export type DeepSearchMessageType =
    | 'deep-search-progress'    // 进度日志
    | 'deep-search-draft'       // 草稿文档（流式）
    | 'deep-search-books'       // 图书列表
    | 'deep-search-report';     // 解读报告（流式）

// 进度日志条目
export interface DeepSearchLogEntry {
    id: string;
    timestamp: string;
    phase: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    message: string;
    details?: string;
}

// 关键词结果
export interface KeywordResult {
    keyword: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
}

// 深度检索进度消息内容
export interface DeepSearchProgressContent {
    type: 'deep-search-progress';
    logs: DeepSearchLogEntry[];
    currentPhase: string;
}

// 深度检索草稿消息内容
export interface DeepSearchDraftContent {
    type: 'deep-search-draft';
    draftMarkdown: string;          // 流式累积内容
    isStreaming: boolean;           // 是否正在流式输出
    isComplete: boolean;            // 是否流式完成
    searchSnippets: DuckDuckGoSnippet[];
    keywords: KeywordResult[];
    userInput: string;
}

// 深度检索图书列表消息内容
export interface DeepSearchBooksContent {
    type: 'deep-search-books';
    books: BookInfo[];
    draftMarkdown: string;          // 用于生成解读的草稿
    userInput: string;
}

// 深度检索解读报告消息内容
export interface DeepSearchReportContent {
    type: 'deep-search-report';
    reportMarkdown: string;         // 流式累积内容
    isStreaming: boolean;           // 是否正在流式输出
    isComplete: boolean;            // 是否流式完成
    selectedBooks: BookInfo[];
}

// 深度检索消息内容联合类型
export type DeepSearchMessageContent =
    | DeepSearchProgressContent
    | DeepSearchDraftContent
    | DeepSearchBooksContent
    | DeepSearchReportContent;

// 深度检索流程阶段
export type DeepSearchPhase =
    | 'idle'              // 空闲
    | 'progress'          // 进度显示中
    | 'draft-streaming'   // 草稿流式输出中
    | 'draft-confirm'     // 草稿确认中
    | 'book-search'       // 图书检索中
    | 'book-selection'    // 图书选择中
    | 'report-streaming'  // 报告流式输出中
    | 'completed';        // 完成

// 深度检索状态
export interface DeepSearchState {
    phase: DeepSearchPhase;
    // 进度相关
    progressMessageId: string | null;
    logs: DeepSearchLogEntry[];
    currentLogPhase: string;
    // 草稿相关
    draftMessageId: string | null;
    draftContent: string;
    isDraftStreaming: boolean;
    isDraftComplete: boolean;
    searchSnippets: DuckDuckGoSnippet[];
    keywords: KeywordResult[];
    // 图书相关
    booksMessageId: string | null;
    books: BookInfo[];
    selectedBooks: BookInfo[];
    // 报告相关
    reportMessageId: string | null;
    reportContent: string;
    isReportStreaming: boolean;
    // 原始输入
    userInput: string;
}

// ========== 文档上传相关类型 ==========

// 上传文档信息接口
export interface UploadedDocument {
    id: string;                    // 唯一标识
    name: string;                  // 文件名
    content: string;               // 文件内容
    size: number;                  // 文件大小（字节）
    uploadTime: Date;             // 上传时间
    status: 'uploading' | 'ready' | 'error';  // 文档状态
}

// 文档上传阶段
export type DocumentUploadPhase =
    | 'idle'                       // 空闲
    | 'uploading'                  // 上传中
    | 'ready'                      // 准备就绪
    | 'analyzing'                  // 分析中
    | 'error';                     // 错误

// 文档分析请求
export interface DocumentAnalysisRequest {
    documents: {
        id: string;
        name: string;
        content: string;
    }[];
}

// 文档分析进度日志条目（复用深度检索的日志结构）
export type DocumentAnalysisLogEntry = DeepSearchLogEntry;

// 文档分析消息类型标识
export type DocumentAnalysisMessageType =
    | 'document-analysis-progress'    // 进度日志
    | 'document-analysis-draft'       // 草稿文档（流式）
    | 'document-analysis-books'       // 图书列表
    | 'document-analysis-report';     // 解读报告（流式）

// 文档分析进度消息内容
export interface DocumentAnalysisProgressContent {
    type: 'document-analysis-progress';
    logs: DocumentAnalysisLogEntry[];
    currentPhase: string;
}

// 文档分析草稿消息内容
export interface DocumentAnalysisDraftContent {
    type: 'document-analysis-draft';
    draftMarkdown: string;          // 流式累积内容
    isStreaming: boolean;           // 是否正在流式输出
    isComplete: boolean;            // 是否流式完成
    documentAnalyses: string[];     // 文档分析结果
    userInput: string;              // 用户输入（文档名称）
}

// 文档分析图书列表消息内容
export interface DocumentAnalysisBooksContent {
    type: 'document-analysis-books';
    books: BookInfo[];
    draftMarkdown: string;          // 用于生成解读的草稿
    userInput: string;              // 用户输入（文档名称）
}

// 文档分析解读报告消息内容
export interface DocumentAnalysisReportContent {
    type: 'document-analysis-report';
    reportMarkdown: string;         // 流式累积内容
    isStreaming: boolean;           // 是否正在流式输出
    isComplete: boolean;            // 是否流式完成
    selectedBooks: BookInfo[];
}

// 文档分析消息内容联合类型
export type DocumentAnalysisMessageContent =
    | DocumentAnalysisProgressContent
    | DocumentAnalysisDraftContent
    | DocumentAnalysisBooksContent
    | DocumentAnalysisReportContent;

// 文档分析流程阶段
export type DocumentAnalysisPhase =
    | 'idle'              // 空闲
    | 'progress'          // 进度显示中
    | 'draft-streaming'   // 草稿流式输出中
    | 'draft-confirm'     // 草稿确认中
    | 'book-search'       // 图书检索中
    | 'book-selection'    // 图书选择中
    | 'report-streaming'  // 报告流式输出中
    | 'completed';        // 完成

// 文档分析状态
export interface DocumentAnalysisState {
    phase: DocumentAnalysisPhase;
    // 进度相关
    progressMessageId: string | null;
    logs: DocumentAnalysisLogEntry[];
    currentLogPhase: string;
    // 草稿相关
    draftMessageId: string | null;
    draftContent: string;
    isDraftStreaming: boolean;
    isDraftComplete: boolean;
    documentAnalyses: string[];     // 文档分析结果
    // 图书相关
    booksMessageId: string | null;
    books: BookInfo[];
    selectedBooks: BookInfo[];
    // 报告相关
    reportMessageId: string | null;
    reportContent: string;
    isReportStreaming: boolean;
    // 原始输入
    userInput: string;
}

// AIBot 工作模式 - 使用constants.ts中的定义
// export type AIBotMode 已从 @/src/core/aibot/constants 导入
