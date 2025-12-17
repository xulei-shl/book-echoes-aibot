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
