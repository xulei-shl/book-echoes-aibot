import { getLogger } from '@/src/utils/logger';
import { fetchWithOptionalProxy } from '@/src/core/aibot/network/proxyFetch';

const logger = getLogger('aibot.jina-extractor');

const JINA_EXTRACTOR_BASE = 'https://r.jina.ai';

interface ExtractionResult {
    success: boolean;
    content?: string;
    error?: string;
    url: string;
}

export async function extractContentFromUrl(
    url: string,
    timeout: number = 15000
): Promise<ExtractionResult> {
    const extractUrl = `${JINA_EXTRACTOR_BASE}/${url}`;
    
    logger.info('开始提取网页内容', { url: extractUrl });

    try {
        const response = await fetchWithOptionalProxy(extractUrl, {
            method: 'GET',
            headers: {
                'Accept': 'text/plain, text/html',
                'User-Agent': 'book-echoes-aibot/1.0'
            },
            signal: AbortSignal.timeout(timeout)
        });

        if (!response.ok) {
            const errorMsg = `HTTP ${response.status}`;
            logger.error('Jina 内容提取失败', { url, error: errorMsg });
            return { success: false, error: errorMsg, url };
        }

        const content = await response.text();

        if (!content || content.trim().length === 0) {
            logger.info('Jina 提取返回空内容', { url });
            return { success: false, error: '空内容', url };
        }

        logger.info('Jina 内容提取成功', { 
            url, 
            contentLength: content.length 
        });

        return { success: true, content: content.trim(), url };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error('Jina 内容提取异常', { url, error: errorMsg });
        return { success: false, error: errorMsg, url };
    }
}

export async function extractContentFromUrls(
    urls: string[],
    concurrency: number = 3,
    timeout: number = 15000
): Promise<Map<string, ExtractionResult>> {
    const results = new Map<string, ExtractionResult>();
    
    const chunks: string[][] = [];
    for (let i = 0; i < urls.length; i += concurrency) {
        chunks.push(urls.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
        const promises = chunk.map(url => extractContentFromUrl(url, timeout));
        const chunkResults = await Promise.all(promises);
        
        chunk.forEach((url, index) => {
            results.set(url, chunkResults[index]);
        });
    }

    return results;
}