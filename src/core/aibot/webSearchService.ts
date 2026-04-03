import { getLogger } from '@/src/utils/logger';
import { researchWithTavily } from '@/src/core/aibot/tavily/tavilyResearcher';
import { researchWithExaMcp } from '@/src/core/aibot/exa/exaMcpResearcher';
import { extractContentFromUrls } from '@/src/core/aibot/jina/jinaContentExtractor';
import { JINA_SEARCH_PER_KEYWORD, DEEP_SEARCH_SNIPPETS_PER_KEYWORD } from '@/src/core/aibot/constants';
import { hasTavilyApiKey, shouldUseTavilySearch, getSearchEngineLabel } from '@/src/core/aibot/searchConfig';
import type { WebSearchSnippet } from '@/src/core/aibot/types';

const logger = getLogger('aibot.webSearch');

interface SearchResultItem {
    title: string;
    url: string;
    snippet: string;
    source: 'tavily' | 'exa';
    raw?: unknown;
}

const UNSUPPORTED_CONTENT_EXTENSIONS = [
    '.pdf', '.mp3', '.mp4', '.wav', '.avi', '.mov', '.webm', '.m4a',
    '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.zip', '.rar'
];

const isContentExtractionSupported = (url: string): boolean => {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname.toLowerCase();
        return !UNSUPPORTED_CONTENT_EXTENSIONS.some(ext => pathname.endsWith(ext));
    } catch {
        return false;
    }
};

const convertToWebSnippet = (item: SearchResultItem): WebSearchSnippet => ({
    title: item.title,
    url: item.url,
    snippet: item.snippet,
    source: item.source as 'tavily' | 'exa',
    raw: item.raw
});

export async function performWebSearch(
    query: string,
    topK?: number
): Promise<WebSearchSnippet[]> {
    const shouldUseTavily = shouldUseTavilySearch();
    const effectiveTopK = topK !== undefined 
        ? topK 
        : (shouldUseTavily ? JINA_SEARCH_PER_KEYWORD : DEEP_SEARCH_SNIPPETS_PER_KEYWORD);

    logger.info('执行网络搜索', {
        query,
        topK: effectiveTopK,
        engine: shouldUseTavily ? 'tavily' : 'exa',
        tavilyConfigured: hasTavilyApiKey()
    });

    const searchResults: SearchResultItem[] = [];

    if (shouldUseTavily) {
        try {
            logger.info('尝试 Tavily 搜索', { query });
            const tavilyResults = await researchWithTavily(query, { topK: effectiveTopK });

            if (tavilyResults.length > 0) {
                logger.info('Tavily 搜索成功', {
                    query,
                    resultCount: tavilyResults.length
                });

                searchResults.push(...tavilyResults.map(r => ({
                    title: r.title,
                    url: r.url,
                    snippet: r.content,
                    source: 'tavily' as const,
                    raw: r.raw
                })));
            } else {
                logger.info('Tavily 返回空结果，尝试 Exa MCP 回退', { query });
            }
        } catch (error) {
            logger.info('Tavily 搜索失败，尝试 Exa MCP 回退', {
                query,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    if (searchResults.length === 0) {
        try {
            logger.info('使用 Exa MCP 搜索', { query });
            const exaResults = await researchWithExaMcp(query, { topK: effectiveTopK });

            searchResults.push(...exaResults.map(r => ({
                title: r.title,
                url: r.url,
                snippet: r.snippet,
                source: 'exa' as const,
                raw: r.raw
            })));

            logger.info('Exa MCP 搜索完成', {
                query,
                resultCount: searchResults.length
            });
        } catch (error) {
            logger.error('Exa MCP 搜索也失败了', {
                query,
                error: error instanceof Error ? error.message : String(error)
            });

            return [{
                title: '搜索服务暂时不可用',
                url: '',
                snippet: `无法完成对"${query}"的搜索，请稍后重试。`,
                source: 'tavily',
                raw: { error: 'All search engines failed' }
            }];
        }
    }

    const urls = searchResults.map(r => r.url).filter(Boolean);
    const supportedUrls = urls.filter(isContentExtractionSupported);
    const skippedUrls = urls.filter(url => !isContentExtractionSupported(url));
    
    if (skippedUrls.length > 0) {
        logger.info('跳过不支持内容提取的URL', { skippedUrls });
    }
    
    if (supportedUrls.length > 0) {
        logger.info('开始获取网页全文内容', { query, urlsCount: supportedUrls.length });
        
        try {
            const extractionResults = await extractContentFromUrls(supportedUrls, 3, 15000);
            
            searchResults.forEach(result => {
                const extraction = extractionResults.get(result.url);
                if (extraction?.success && extraction.content) {
                    (result as any).content = extraction.content;
                }
            });
            
            logger.info('网页内容提取完成', { query, successCount: [...extractionResults.values()].filter(r => r.success).length });
        } catch (error) {
            logger.error('网页内容提取失败', { 
                query, 
                error: error instanceof Error ? error.message : String(error) 
            });
        }
    }

    return searchResults.map(convertToWebSnippet);
}