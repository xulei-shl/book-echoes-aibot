import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
import { getLogger } from '@/src/utils/logger';
import { MAX_SNIPPETS } from '@/src/core/aibot/constants';
import type { ExaSnippet, ExaSearchOptions } from '@/src/core/aibot/types';

const logger = getLogger('aibot.exa');

interface McpContentItem {
    type?: string;
    text?: string;
    data?: unknown;
}

interface ExaMcpResult {
    content?: McpContentItem[];
}

const fallbackSnippet = (item: { title?: string; url?: string; snippet?: string; }, index: number): ExaSnippet => ({
    title: item.title ?? `Exa 结果 ${index + 1}`,
    url: item.url ?? '',
    snippet: item.snippet ?? '暂无摘要',
    raw: item
});

export const parseMcpResult = (result: ExaMcpResult): ExaSnippet[] => {
    const payloads: Array<{ title?: string; url?: string; snippet?: string }> = [];
    
    for (const item of result.content ?? []) {
        if ('type' in item && item.type === 'text') {
            const text = (item.text ?? '').trim();
            if (text) {
                try {
                    const parsed = JSON.parse(text);
                    if (Array.isArray(parsed)) {
                        payloads.push(...parsed);
                    } else if (parsed.title || parsed.url) {
                        payloads.push(parsed);
                    }
                } catch {
                    payloads.push({ title: text.slice(0, 40), snippet: text });
                }
            }
            continue;
        }

        if ('type' in item && item.type === 'json' && 'data' in item) {
            if (Array.isArray(item.data)) {
                payloads.push(...(item.data as Array<{ title?: string; url?: string; snippet?: string }>));
            } else if (item.data) {
                payloads.push(item.data as { title?: string; url?: string; snippet?: string });
            }
        }
    }

    return payloads.map((payload, index) => fallbackSnippet(payload, index));
};

const EXA_MCP_URL = 'https://mcp.exa.ai/mcp';

export const fetchViaMcp = async (query: string, topK: number): Promise<ExaSnippet[]> => {
    const client = new Client(
        {
            name: 'book-echoes-web',
            version: '1.0.0'
        },
        {
            capabilities: {}
        }
    );

    const transport = new WebSocketClientTransport(new URL(EXA_MCP_URL));

    try {
        await client.connect(transport);
        
        const result = await client.callTool({
            name: 'web_search_exa',
            arguments: {
                query,
                count: topK
            }
        });

        if (result.isError) {
            logger.error('Exa MCP 调用失败', { query, message: (result.content as any)?.[0]?.text });
            throw new Error('Exa MCP 调用失败');
        }

        const snippets = parseMcpResult(result as ExaMcpResult);
        
        logger.info('Exa MCP 搜索成功', { query, count: snippets.length });
        
        return snippets.slice(0, topK);
    } catch (error) {
        logger.error('Exa MCP 连接失败', { 
            query, 
            error: error instanceof Error ? error.message : String(error) 
        });
        throw error;
    } finally {
        await transport.close();
    }
};

export async function researchWithExaMcp(
    query: string,
    options?: ExaSearchOptions
): Promise<ExaSnippet[]> {
    const topK = options?.topK ?? MAX_SNIPPETS;

    try {
        const snippets = await fetchViaMcp(query, topK);
        return snippets;
    } catch (error) {
        logger.error('Exa MCP 搜索完全失败', { 
            query, 
            error: error instanceof Error ? error.message : String(error) 
        });
        throw error;
    }
}