import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
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
        const impl = (ws as { WebSocket?: unknown; default?: unknown }).WebSocket ?? (ws as { default?: unknown }).default ?? ws;
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
            const text = (item.text ?? '').trim();
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
    if (!wsUrl) {
        return undefined;
    }

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

    const transport = new WebSocketClientTransport(wsUrl);

    try {
        await client.connect(transport);
        const toolName = process.env.DDG_MCP_TOOL_NAME ?? 'duckduckgo-search';
        const result = await client.callTool({
            name: toolName,
            arguments: {
                query,
                top_k: topK
            }
        });

        if (result.isError) {
            logger.error('MCP DuckDuckGo 调用失败', { query, message: result.content?.[0]?.text });
            return undefined;
        }

        const snippets = parseMcpResult(result);
        return snippets.length ? snippets.slice(0, topK) : undefined;
    } catch (error) {
        logger.error('连接 MCP DuckDuckGo 失败，启用 HTTP 回退', { error });
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
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'book-echoes-aibot/1.0'
        }
    });

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
    const snippetsFromMcp = await fetchViaMcp(query, topK);
    if (snippetsFromMcp?.length) {
        return snippetsFromMcp;
    }
    return fetchViaHttp(query, topK);
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
