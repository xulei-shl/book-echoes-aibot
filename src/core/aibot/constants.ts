export const AIBOT_PROMPT_FILES = {
    ARTICLE_ANALYSIS: 'article_analysis',
    ARTICLE_CROSS_ANALYSIS: 'article_cross_analysis',
    QUESTION_CLASSIFIER: 'aibot_question_classifier',
    RECOMMENDATION: '推荐导语',
    SIMPLE_SEARCH: 'simple_search_prompt',
    KEYWORD_GENERATION: 'keyword_generation'
} as const;

export const AIBOT_MODES = {
    TEXT: 'text-search',
    DEEP: 'deep'
} as const;

export type AIBotMode = (typeof AIBOT_MODES)[keyof typeof AIBOT_MODES];

export const AIBOT_INTENTS = {
    SEARCH: 'search',
    OTHER: 'other'
} as const;

export type AIBotIntent = (typeof AIBOT_INTENTS)[keyof typeof AIBOT_INTENTS];

export const STREAM_EVENTS = {
    CHUNK: 'aibot:chunk',
    ERROR: 'aibot:error',
    DONE: 'aibot:done'
} as const;

export const DEFAULT_TOP_K = 8;
export const DEFAULT_MULTI_QUERY_TOP_K = 12;
export const MAX_SNIPPETS = 8;
export const DEEP_SEARCH_SNIPPETS_PER_KEYWORD = 5;

// ========== Jina AI 搜索配置 ==========
export const JINA_SEARCH_PER_KEYWORD = 3;      // 每个关键词返回的搜索结果数
export const JINA_API_TIMEOUT = 30000;         // Jina API 请求超时时间（毫秒）
