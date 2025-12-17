import { DEFAULT_PLAIN_TEXT_TEMPLATE } from '@/src/utils/aibot-env';
import { getBookApiBase } from '@/src/utils/aibot-env';
import { getLogger } from '@/src/utils/logger';
import type { MultiQueryPayload, RetrievalResult, TextSearchPayload } from '@/src/core/aibot/types';

const logger = getLogger('aibot.retrieval');

const JSON_HEADERS = {
    'Content-Type': 'application/json'
};

const ensureTemplate = <T extends { plain_text_template?: string }>(payload: T): T => {
    if (payload.plain_text_template) {
        return payload;
    }
    return {
        ...payload,
        plain_text_template: DEFAULT_PLAIN_TEXT_TEMPLATE
    };
};

const ensureFormat = <T extends { response_format?: 'json' | 'plain_text' }>(payload: T): T => {
    if (payload.response_format) {
        return payload;
    }
    return {
        ...payload,
        response_format: 'plain_text'
    };
};

async function postBookApi<T>(
    path: string,
    payload: Record<string, unknown>
): Promise<RetrievalResult<T>> {
    const endpoint = `${getBookApiBase()}${path}`;
    logger.debug('请求图书检索 API', { endpoint, payloadKeys: Object.keys(payload) });

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        logger.error('图书检索 API 调用失败', { endpoint, status: response.status });
        throw new Error(`图书检索 API 返回 ${response.status}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('text/plain')) {
        const contextPlainText = await response.text();
        return {
            contextPlainText,
            metadata: {}
        };
    }

    const data = await response.json();
    const contextPlainText: string =
        data.context_plain_text ??
        data.contextPlainText ??
        '';

    if (!contextPlainText) {
        logger.error('API 响应缺少 context_plain_text', { endpoint });
        throw new Error('图书检索 API 响应异常：缺少 context_plain_text');
    }

    return {
        contextPlainText,
        metadata: data.metadata ?? {}
    };
}

/**
 * 包装 `/api/books/text-search`。
 */
export async function textSearch(payload: TextSearchPayload): Promise<RetrievalResult> {
    const enriched = ensureTemplate(ensureFormat(payload));
    return postBookApi('/api/books/text-search', enriched);
}

/**
 * 包装 `/api/books/multi-query`。
 */
export async function multiQuery(payload: MultiQueryPayload): Promise<RetrievalResult> {
    const enriched = ensureTemplate(ensureFormat(payload));
    return postBookApi('/api/books/multi-query', enriched);
}
