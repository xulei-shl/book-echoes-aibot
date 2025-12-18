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
