export const hasTavilyApiKey = (): boolean => {
    const apiKey = process.env.TAVILY_API_KEY;
    return Boolean(apiKey && apiKey.trim().length > 0);
};

export const hasExaApiKey = (): boolean => {
    const apiKey = process.env.EXA_API_KEY;
    return Boolean(apiKey && apiKey.trim().length > 0);
};

export const shouldUseTavilySearch = (): boolean => hasTavilyApiKey();

export const getSearchEngineLabel = (): 'Tavily' | 'Exa' => (
    shouldUseTavilySearch() ? 'Tavily' : 'Exa'
);