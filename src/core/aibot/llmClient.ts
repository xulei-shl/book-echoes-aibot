import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText } from 'ai';
import type { GenerateTextResult, StreamTextResult } from 'ai';
import { resolveLLMCandidates, type LLMConfig } from '@/src/utils/aibot-env';
import { getLogger } from '@/src/utils/logger';

const logger = getLogger('aibot.llm');

export interface LLMCallAttempt {
    candidateIndex: number;
    model: string;
    baseURL: string;
    reason: string;
}

export interface LLMCallFailure extends Error {
    attempts: LLMCallAttempt[];
}

const createModel = (config: LLMConfig) => {
    const customProvider = createOpenAICompatible({
        name: 'custom-llm',
        baseURL: config.baseURL,
        apiKey: config.apiKey
    });

    return customProvider(config.model);
};

const getErrorMessage = (error: unknown): string => {
    if (!(error instanceof Error)) {
        return '未知错误';
    }

    const maybeApiError = error as Error & {
        statusCode?: number;
        responseBody?: string;
        cause?: { message?: string };
    };

    const parts = [error.message];
    if (typeof maybeApiError.statusCode === 'number') {
        parts.push(`status=${maybeApiError.statusCode}`);
    }
    if (typeof maybeApiError.responseBody === 'string' && maybeApiError.responseBody.trim()) {
        parts.push(`response=${maybeApiError.responseBody.trim().slice(0, 300)}`);
    } else if (typeof maybeApiError.cause?.message === 'string' && maybeApiError.cause.message.trim()) {
        parts.push(`cause=${maybeApiError.cause.message.trim().slice(0, 200)}`);
    }
    return parts.join(' | ');
};

const isRetryableError = (error: unknown): boolean => {
    if (!(error instanceof Error)) {
        return false;
    }

    const maybeApiError = error as Error & { statusCode?: number };
    const message = error.message.toLowerCase();
    const statusCode = maybeApiError.statusCode;

    if (typeof statusCode === 'number') {
        if (statusCode === 408 || statusCode === 409 || statusCode === 429) {
            return true;
        }
        if (statusCode >= 500) {
            return true;
        }
        return false;
    }

    return ['timeout', 'timed out', 'network', 'fetch failed', 'socket', 'econnreset', '503', '502', '429']
        .some(keyword => message.includes(keyword));
};

const createFailure = (attempts: LLMCallAttempt[], error: unknown): LLMCallFailure => {
    const finalError = error instanceof Error ? error : new Error('LLM 调用失败');
    const failure = finalError as LLMCallFailure;
    failure.attempts = attempts;
    return failure;
};

const normalizeFetchBody = async (response: Response): Promise<string> => {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const json = await response.json();
        return JSON.stringify(json);
    }
    return response.text();
};

export function getLLMConfigSummary(): string {
    return resolveLLMCandidates()
        .map((candidate, index) => `candidate${index + 1}=model=${candidate.model} | baseURL=${candidate.baseURL}`)
        .join(' || ');
}

export async function generateTextWithFallback(
    options: Omit<Parameters<typeof generateText>[0], 'model'>
): Promise<GenerateTextResult<any, any>> {
    const candidates = resolveLLMCandidates();
    const attempts: LLMCallAttempt[] = [];

    for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];

        try {
            logger.info('尝试 generateText', {
                candidateIndex: index + 1,
                model: candidate.model,
                baseURL: candidate.baseURL
            });

            const result = await generateText({
                ...options,
                model: createModel(candidate)
            });

            logger.info('generateText 成功', {
                candidateIndex: index + 1,
                model: candidate.model,
                baseURL: candidate.baseURL
            });

            return result;
        } catch (error) {
            const reason = getErrorMessage(error);
            attempts.push({
                candidateIndex: index + 1,
                model: candidate.model,
                baseURL: candidate.baseURL,
                reason
            });

            logger.error('generateText 失败', {
                candidateIndex: index + 1,
                model: candidate.model,
                baseURL: candidate.baseURL,
                reason
            });

            if (!isRetryableError(error) || index === candidates.length - 1) {
                throw createFailure(attempts, error);
            }
        }
    }

    throw createFailure(attempts, new Error('没有可用的 LLM 候选配置'));
}

export async function streamTextWithFallback(
    options: Omit<Parameters<typeof streamText>[0], 'model'>
): Promise<StreamTextResult<any, any>> {
    const candidates = resolveLLMCandidates();
    const attempts: LLMCallAttempt[] = [];

    for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];

        try {
            logger.info('尝试 streamText', {
                candidateIndex: index + 1,
                model: candidate.model,
                baseURL: candidate.baseURL
            });

            const result = await streamText({
                ...options,
                model: createModel(candidate)
            });

            logger.info('streamText 已启动', {
                candidateIndex: index + 1,
                model: candidate.model,
                baseURL: candidate.baseURL
            });

            return result;
        } catch (error) {
            const reason = getErrorMessage(error);
            attempts.push({
                candidateIndex: index + 1,
                model: candidate.model,
                baseURL: candidate.baseURL,
                reason
            });

            logger.error('streamText 启动失败', {
                candidateIndex: index + 1,
                model: candidate.model,
                baseURL: candidate.baseURL,
                reason
            });

            if (!isRetryableError(error) || index === candidates.length - 1) {
                throw createFailure(attempts, error);
            }
        }
    }

    throw createFailure(attempts, new Error('没有可用的 LLM 候选配置'));
}

export async function postChatCompletionsWithFallback(body: Record<string, unknown>): Promise<any> {
    const candidates = resolveLLMCandidates();
    const attempts: LLMCallAttempt[] = [];

    for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];

        try {
            logger.info('尝试 chat completions', {
                candidateIndex: index + 1,
                model: candidate.model,
                baseURL: candidate.baseURL
            });

            const response = await fetch(`${candidate.baseURL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${candidate.apiKey}`
                },
                body: JSON.stringify({
                    ...body,
                    model: candidate.model
                })
            });

            if (!response.ok) {
                const responseBody = await normalizeFetchBody(response);
                const error = new Error(`LLM API返回 ${response.status}: ${responseBody}`) as Error & { statusCode?: number; responseBody?: string };
                error.statusCode = response.status;
                error.responseBody = responseBody;
                throw error;
            }

            const data = await response.json();
            logger.info('chat completions 成功', {
                candidateIndex: index + 1,
                model: candidate.model,
                baseURL: candidate.baseURL
            });
            return data;
        } catch (error) {
            const reason = getErrorMessage(error);
            attempts.push({
                candidateIndex: index + 1,
                model: candidate.model,
                baseURL: candidate.baseURL,
                reason
            });

            logger.error('chat completions 失败', {
                candidateIndex: index + 1,
                model: candidate.model,
                baseURL: candidate.baseURL,
                reason
            });

            if (!isRetryableError(error) || index === candidates.length - 1) {
                throw createFailure(attempts, error);
            }
        }
    }

    throw createFailure(attempts, new Error('没有可用的 LLM 候选配置'));
}
