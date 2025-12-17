import type { AIBotMode } from '@/src/core/aibot/constants';
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
