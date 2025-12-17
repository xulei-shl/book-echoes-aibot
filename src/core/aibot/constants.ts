export const AIBOT_PROMPT_FILES = {
    ARTICLE_ANALYSIS: 'article_analysis',
    ARTICLE_CROSS_ANALYSIS: 'article_cross_analysis',
    RECOMMENDATION: '推荐导语'
} as const;

export const AIBOT_MODES = {
    TEXT: 'text-search',
    DEEP: 'deep'
} as const;

export type AIBotMode = (typeof AIBOT_MODES)[keyof typeof AIBOT_MODES];

export const STREAM_EVENTS = {
    CHUNK: 'aibot:chunk',
    ERROR: 'aibot:error',
    DONE: 'aibot:done'
} as const;

export const DEFAULT_TOP_K = 8;
export const DEFAULT_MULTI_QUERY_TOP_K = 12;
export const MAX_SNIPPETS = 6;
