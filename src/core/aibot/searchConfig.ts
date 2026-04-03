const isEnvEnabled = (value: string | undefined): boolean => value !== 'false';

export const hasJinaApiKey = (): boolean => Boolean(process.env.JINA_API_KEY?.trim());

export const shouldUseJinaSearch = (): boolean => isEnvEnabled(process.env.USE_JINA_SEARCH) && hasJinaApiKey();

export const getSearchEngineLabel = (): 'Jina' | 'DuckDuckGo' => (
    shouldUseJinaSearch() ? 'Jina' : 'DuckDuckGo'
);
