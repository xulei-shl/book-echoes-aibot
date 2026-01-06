import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { getLogger } from '@/src/utils/logger';
import { MAX_SNIPPETS } from '@/src/core/aibot/constants';
import type { DuckDuckGoOptions, DuckDuckGoSnippet } from '@/src/core/aibot/types';

const logger = getLogger('aibot.duckduckgo');

interface McpSnippetPayload {
    title?: string;
    url?: string;
    snippet?: string;
    summary?: string;
}

const fallbackSnippet = (snippet: Partial<McpSnippetPayload>, index: number): DuckDuckGoSnippet => ({
    title: snippet.title ?? `DuckDuckGo 结果 ${index + 1}`,
    url: snippet.url ?? 'https://duckduckgo.com',
    snippet: snippet.snippet ?? snippet.summary ?? '暂无摘要',
    raw: snippet
});

const ensureWebSocket = async () => {
    if (typeof WebSocket !== 'undefined') {
        return true;
    }
    try {
        const ws = await import('ws');
        const impl = (ws as any).WebSocket ?? (ws as any).default ?? ws;
        (globalThis as typeof globalThis & { WebSocket?: unknown }).WebSocket = impl;
        return true;
    } catch (error) {
        logger.debug('ws 库不可用，无法连接 MCP', { error });
        return false;
    }
};

const parseMcpResult = (toolResult: { content?: McpContentItem[] }): DuckDuckGoSnippet[] => {
    const payloads: McpSnippetPayload[] = [];
    for (const item of toolResult.content ?? []) {
        if ('type' in item && item.type === 'text') {
            const text = ((item as any).text ?? '').trim();
            if (text) {
                try {
                    const parsed = JSON.parse(text);
                    if (Array.isArray(parsed)) {
                        payloads.push(...(parsed as McpSnippetPayload[]));
                    } else {
                        payloads.push(parsed as McpSnippetPayload);
                    }
                } catch {
                    payloads.push({ title: text.slice(0, 40), snippet: text });
                }
            }
            continue;
        }

        if ('type' in item && item.type === 'json' && 'data' in item) {
            if (Array.isArray(item.data)) {
                payloads.push(...(item.data as McpSnippetPayload[]));
            } else {
                payloads.push(item.data as McpSnippetPayload);
            }
        }
    }

    return payloads.map((payload, index) => fallbackSnippet(payload, index));
};

const fetchViaMcp = async (query: string, topK: number): Promise<DuckDuckGoSnippet[] | undefined> => {
    const wsUrl = process.env.DDG_MCP_WS_URL;
    const command = process.env.DDG_MCP_COMMAND;
    const args = process.env.DDG_MCP_ARGS?.split(',') || [];
    
    logger.info('MCP配置检查', {
        wsUrl: wsUrl || '未配置',
        command: command || '未配置',
        args: args
    });

    // 优先使用stdio方式
    if (command) {
        logger.info('使用stdio方式连接MCP');
        return await fetchViaStdio(query, topK);
    }

    // 回退到WebSocket方式
    if (wsUrl) {
        logger.info('使用WebSocket方式连接MCP');
        return await fetchViaWebSocket(query, topK);
    }

    logger.info('MCP未配置，将使用HTTP回退');
    return undefined;
};

const fetchViaStdio = async (query: string, topK: number): Promise<DuckDuckGoSnippet[] | undefined> => {
    const command = process.env.DDG_MCP_COMMAND!;
    const args = process.env.DDG_MCP_ARGS?.split(',') || [];
    
    const client = new Client(
        {
            name: 'book-echoes-web',
            version: '1.0.0'
        },
        {
            capabilities: {}
        }
    );

    const transport = new StdioClientTransport({
        command,
        args
    });

    try {
        await client.connect(transport);
        // uvx duckduckgo-mcp-server 使用 'search' 工具名，参数为 count
        const toolName = process.env.DDG_MCP_TOOL_NAME ?? 'search';

        logger.info('调用MCP工具', { toolName, query, count: topK });

        const result = await client.callTool({
            name: toolName,
            arguments: {
                query,
                count: topK  // duckduckgo-mcp-server 使用 count 参数 (1-20)
            }
        });

        if (result.isError) {
            logger.error('MCP DuckDuckGo 调用失败', { query, message: (result.content as any)?.[0]?.text });
            return undefined;
        }

        const snippets = parseMcpResult(result as any);
        logger.info('MCP调用成功', { snippetsCount: snippets.length });
        return snippets.length ? snippets.slice(0, topK) : undefined;
    } catch (error) {
        logger.error('连接 stdio MCP DuckDuckGo 失败，启用 HTTP 回退', { error });
        return undefined;
    } finally {
        await transport.close();
    }
};

const fetchViaWebSocket = async (query: string, topK: number): Promise<DuckDuckGoSnippet[] | undefined> => {
    const wsUrl = process.env.DDG_MCP_WS_URL!;
    
    const hasWs = await ensureWebSocket();
    if (!hasWs) {
        return undefined;
    }

    const client = new Client(
        {
            name: 'book-echoes-web',
            version: '1.0.0'
        },
        {
            capabilities: {}
        }
    );

    const transport = new WebSocketClientTransport(new URL(wsUrl));

    try {
        await client.connect(transport);
        // WebSocket 方式同样使用 'search' 工具名和 count 参数
        const toolName = process.env.DDG_MCP_TOOL_NAME ?? 'search';
        const result = await client.callTool({
            name: toolName,
            arguments: {
                query,
                count: topK  // duckduckgo-mcp-server 使用 count 参数 (1-20)
            }
        });

        if (result.isError) {
            logger.error('MCP DuckDuckGo 调用失败', { query, message: (result.content as any)?.[0]?.text });
            return undefined;
        }

        const snippets = parseMcpResult(result as any);
        return snippets.length ? snippets.slice(0, topK) : undefined;
    } catch (error) {
        logger.error('连接 WebSocket MCP DuckDuckGo 失败，启用 HTTP 回退', { error });
        return undefined;
    } finally {
        await transport.close();
    }
};

const formatDuckDuckGoTopic = (topic: DuckDuckGoApiTopic): DuckDuckGoSnippet | DuckDuckGoSnippet[] => {
    if (Array.isArray(topic.Topics)) {
        return topic.Topics.map(formatDuckDuckGoTopic).flat();
    }

    return {
        title: topic.Text ?? topic.FirstURL ?? 'DuckDuckGo',
        url: topic.FirstURL ?? 'https://duckduckgo.com',
        snippet: topic.Result ?? topic.Text ?? '暂无摘要',
        raw: topic
    };
};

const fetchViaHttp = async (query: string, topK: number): Promise<DuckDuckGoSnippet[]> => {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
    logger.info('开始HTTP请求DuckDuckGo API', { url, query });
    
    // 配置代理和超时
    const fetchOptions: RequestInit = {
        headers: {
            'User-Agent': 'book-echoes-aibot/1.0'
        },
        // 增加超时时间到30秒
        signal: AbortSignal.timeout(30000)
    };

    // 如果配置了代理，添加代理设置
    const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    if (proxyUrl) {
        logger.info('使用代理', { proxyUrl });
        // 注意：Node.js fetch API 不直接支持代理，需要使用代理库
        // 这里先记录，后续可以考虑使用 node-fetch 或 https-proxy-agent
    }
    
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
        logger.error('DuckDuckGo HTTP 请求失败', { status: response.status });
        throw new Error('DuckDuckGo HTTP 请求失败');
    }

    const data = await response.json();
    const related = Array.isArray(data.RelatedTopics)
        ? (data.RelatedTopics as DuckDuckGoApiTopic[]).map(formatDuckDuckGoTopic).flat()
        : [];
    const results = Array.isArray(data.Results)
        ? (data.Results as DuckDuckGoApiTopic[]).map((item, index: number) =>
            fallbackSnippet(
                {
                    title: item.Text,
                    url: item.FirstURL,
                    snippet: item.Result
                },
                index
            )
        )
        : [];

    const combined = [...related, ...results].filter(Boolean) as DuckDuckGoSnippet[];
    return combined.slice(0, topK);
};

/**
 * 综合 MCP 与 HTTP 回退，获取 DuckDuckGo 摘要。
 */
export async function researchWithDuckDuckGo(
    query: string,
    options?: DuckDuckGoOptions
): Promise<DuckDuckGoSnippet[]> {
    const topK = options?.topK ?? MAX_SNIPPETS;
    
    try {
        // 优先尝试MCP方式
        const snippetsFromMcp = await fetchViaMcp(query, topK);
        if (snippetsFromMcp?.length) {
            logger.info('MCP方式成功获取结果', { count: snippetsFromMcp.length });
            return snippetsFromMcp;
        }
    } catch (error) {
        logger.info('MCP方式失败，尝试HTTP回退', { error });
    }
    
    try {
        // 回退到HTTP方式
        const snippetsFromHttp = await fetchViaHttp(query, topK);
        logger.info('HTTP方式成功获取结果', { count: snippetsFromHttp.length });
        return snippetsFromHttp;
    } catch (error) {
        logger.error('所有方式都失败了', { error });
        
        // 提供模拟数据作为最后的回退，确保功能可用
        const fallbackSnippets: DuckDuckGoSnippet[] = [
            {
                title: '网络连接问题',
                url: 'https://duckduckgo.com',
                snippet: `无法连接到外部搜索服务。关于"${query}"的搜索暂时不可用，请检查网络连接或稍后重试。`,
                raw: { error: 'Network connection failed' }
            }
        ];
        
        logger.info('使用模拟数据回退', { query });
        return fallbackSnippets;
    }
}
type McpContentItem =
    | {
        type: 'text';
        text?: string;
    }
    | {
        type: 'json';
        data?: unknown;
    }
    | Record<string, unknown>;

type DuckDuckGoApiTopic = {
    Text?: string;
    Result?: string;
    FirstURL?: string;
    Topics?: DuckDuckGoApiTopic[];
};
