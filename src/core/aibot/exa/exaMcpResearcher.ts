import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { getLogger } from '@/src/utils/logger';
import { MAX_SNIPPETS } from '@/src/core/aibot/constants';
import type { ExaSnippet, ExaSearchOptions } from '@/src/core/aibot/types';

const logger = getLogger('aibot.exa');

const EXA_MCP_URL = 'https://mcp.exa.ai/mcp';
const EXA_MCP_TIMEOUT = 30000;

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

/**
 * Exa 的 web_search_exa 返回纯文本，固定格式为：
 * Title: ...\nURL: ...\nPublished: ...\nAuthor: ...\nHighlights:\n...，多条结果以 `---` 分隔。
 */
export const parseExaTextResult = (text: string): ExaSnippet[] => {
    const blocks = text
        .split(/\n(?=Title:\s)/)
        .map(block => block.replace(/\n-{3,}\s*$/, '').trim())
        .filter(Boolean);

    return blocks.map((block, index) => {
        const title = /^Title:\s*(.+)$/m.exec(block)?.[1]?.trim() ?? '';
        const url = /^URL:\s*(.+)$/m.exec(block)?.[1]?.trim() ?? '';
        const highlights = block.split(/^Highlights:\s*$/m)[1]?.trim() ?? '';

        return {
            title: title || `Exa 结果 ${index + 1}`,
            url,
            snippet: highlights || '暂无摘要',
            raw: block
        };
    });
};

const parseJsonPayload = (text: string): Array<{ title?: string; url?: string; snippet?: string }> | null => {
    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
            return parsed.filter(item => item && typeof item === 'object');
        }
        if (parsed && typeof parsed === 'object' && (parsed.title || parsed.url)) {
            return [parsed];
        }
    } catch {
        // 非 JSON 文本，走 Exa 文本格式解析
    }

    return null;
};

export const parseMcpResult = (result: ExaMcpResult): ExaSnippet[] => {
    const snippets: ExaSnippet[] = [];

    for (const item of result.content ?? []) {
        if (item.type === 'text') {
            const text = (item.text ?? '').trim();
            if (!text) {
                continue;
            }

            const jsonPayload = parseJsonPayload(text);
            if (jsonPayload) {
                snippets.push(...jsonPayload.map(fallbackSnippet));
                continue;
            }

            if (/^Title:\s/m.test(text)) {
                snippets.push(...parseExaTextResult(text));
                continue;
            }

            snippets.push(fallbackSnippet({ title: text.slice(0, 40), snippet: text }, snippets.length));
            continue;
        }

        if (item.type === 'json' && item.data) {
            if (Array.isArray(item.data)) {
                snippets.push(...(item.data as Array<{ title?: string; url?: string; snippet?: string }>).map(fallbackSnippet));
            } else {
                snippets.push(fallbackSnippet(item.data as { title?: string; url?: string; snippet?: string }, snippets.length));
            }
        }
    }

    return snippets;
};

const fetchViaMcp = async (query: string, topK: number): Promise<ExaSnippet[]> => {
    const client = new Client(
        {
            name: 'book-echoes-web',
            version: '1.0.0'
        },
        {
            capabilities: {}
        }
    );

    const transport = new StreamableHTTPClientTransport(new URL(EXA_MCP_URL));

    try {
        await client.connect(transport, { timeout: EXA_MCP_TIMEOUT });

        const result = await client.callTool({
            name: 'web_search_exa',
            arguments: {
                query,
                numResults: topK,
                objective: `找出与“${query}”最相关、信息完整的权威网页`
            }
        }, undefined, { timeout: EXA_MCP_TIMEOUT });

        if (result.isError) {
            const failureMessage = (result.content as McpContentItem[] | undefined)?.[0]?.text;
            logger.error('Exa MCP 调用失败', { query, message: failureMessage });
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
        return await fetchViaMcp(query, topK);
    } catch (error) {
        logger.error('Exa MCP 搜索完全失败', {
            query,
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}
