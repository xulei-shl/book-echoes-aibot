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
    DEEP: 'deep',
    DOCUMENT: 'document'
} as const;

export type AIBotMode = (typeof AIBOT_MODES)[keyof typeof AIBOT_MODES];

export const AIBOT_INTENTS = {
    SEARCH: 'search',
    SIMPLE_SEARCH: 'simple_search',
    DEEP_SEARCH: 'deep_search',
    OTHER: 'other'
} as const;

export type AIBotIntent = (typeof AIBOT_INTENTS)[keyof typeof AIBOT_INTENTS];

export const STREAM_EVENTS = {
    CHUNK: 'aibot:chunk',
    ERROR: 'aibot:error',
    DONE: 'aibot:done'
} as const;

export const DEFAULT_TOP_K = 5;
export const DEFAULT_MULTI_QUERY_TOP_K = 12;

// ========== 网络搜索配置 ==========
export const MAX_SNIPPETS = 8;                  // 单个检索源默认结果数上限
export const SEARCH_RESULTS_PER_KEYWORD = 5;   // 每个关键词返回的搜索结果数
export const DOUBAO_MAX_RESULTS = 50;          // 豆包搜索单次结果上限
export const ANYSEARCH_MAX_RESULTS = 10;       // AnySearch 单次结果上限
