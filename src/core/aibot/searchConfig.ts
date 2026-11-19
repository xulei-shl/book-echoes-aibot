const hasEnvValue = (name: string): boolean => {
    const value = process.env[name];
    return Boolean(value && value.trim().length > 0);
};

export const hasDoubaoApiKey = (): boolean => hasEnvValue('DOUBAO_API_KEY');
export const hasTavilyApiKey = (): boolean => hasEnvValue('TAVILY_API_KEY');

// AnySearch 支持匿名调用（按 IP 限流），因此未配置 Key 时依然可用
export const hasAnysearchApiKey = (): boolean => hasEnvValue('ANYSEARCH_API_KEY');

/**
 * 当前实际可用的检索源展示顺序，用于进度提示。
 */
export const getSearchEngineLabel = (): string => {
    const labels: string[] = [];

    if (hasDoubaoApiKey()) {
        labels.push('豆包');
    }
    if (hasTavilyApiKey()) {
        labels.push('Tavily');
    }

    labels.push('AnySearch', 'Exa');

    return labels.join(' → ');
};
