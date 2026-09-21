import { getLogger } from '@/src/utils/logger';
import { readJevConfig, type JevConfig } from '@/lib/search/config';
import { decodeResponse } from './decode';
import { JevDisabledError, JevError, JevProtocolError } from './errors';
import type { SystemOneRequest, SystemOneResult } from './types';

const logger = getLogger('jev.client');

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
/** 仅这些状态码与网络错误重试（401/403/422 重试无意义且掩盖配置错误） */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 529]);
const MAX_ATTEMPTS = 2;
const BASE_BACKOFF_MS = 600;

export interface SystemOneOptions {
  config?: JevConfig;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

function userMessageFor(status: number): string {
  if (status === 401 || status === 403) return '语义检索服务的密钥无效或权限不足';
  if (status === 422) return '语义检索请求被拒绝（参数不合法）';
  if (status === 429) return '语义检索服务限流，请稍后重试';
  if (status === 529 || status >= 500) return '语义检索服务暂时不可用';
  if (status === 0) return '语义检索服务网络异常';
  return `语义检索服务返回了异常状态（HTTP ${status}）`;
}

function combineSignals(signals: (AbortSignal | undefined)[]): AbortSignal {
  const list = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (list.length === 1) return list[0];
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(list);
  const controller = new AbortController();
  for (const signal of list) {
    if (signal.aborted) {
      controller.abort();
      continue;
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 调用 Jev 并做严格解码。
 *
 * 错误归一：抛出 JevError / JevProtocolError；userMessage 面向用户可读，
 * provider body 只进 logger，绝不回传前端。
 */
export async function systemOne(
  request: SystemOneRequest,
  options: SystemOneOptions = {}
): Promise<SystemOneResult> {
  const config = options.config ?? readJevConfig();
  if (!config) {
    throw new JevDisabledError();
  }
  const fetchImpl = options.fetchImpl ?? fetch;

  let attempts = 0;
  let lastBackoff = BASE_BACKOFF_MS;

  for (;;) {
    attempts += 1;
    const startedAt = Date.now();
    const signal = combineSignals([
      options.signal,
      AbortSignal.timeout(config.timeoutMs)
    ]);

    try {
      const response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          state: request.state,
          model: config.model,
          questions: request.questions
        }),
        signal
      });

      const bodyText = await response.text();

      if (!response.ok) {
        const retryable = RETRYABLE_STATUS.has(response.status);
        logger.error('Jev 返回非 2xx', {
          status: response.status,
          attempt: attempts,
          providerMessage: bodyText.slice(0, 200)
        });
        if (retryable && attempts < MAX_ATTEMPTS && !options.signal?.aborted) {
          await sleep(lastBackoff + Math.floor(Math.random() * 50));
          lastBackoff *= 2;
          continue;
        }
        throw new JevError(response.status, userMessageFor(response.status), {
          providerMessage: bodyText.slice(0, 200)
        });
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        throw new JevProtocolError('Jev 响应不是合法 JSON');
      }

      const decoded = decodeResponse(parsed, request.questions, config.model);
      return {
        ...decoded,
        requestedModel: config.model,
        attempts,
        roundTripMs: Date.now() - startedAt
      };
    } catch (error) {
      if (error instanceof JevError || error instanceof JevProtocolError) {
        throw error;
      }
      const aborted = options.signal?.aborted === true;
      if (!aborted && attempts < MAX_ATTEMPTS) {
        logger.error('Jev 请求失败，准备重试', {
          attempt: attempts,
          message: error instanceof Error ? error.message : String(error)
        });
        await sleep(lastBackoff + Math.floor(Math.random() * 50));
        lastBackoff *= 2;
        continue;
      }
      if (aborted) {
        throw error;
      }
      logger.error('Jev 请求失败', { message: error instanceof Error ? error.message : String(error) });
      throw new JevError(0, userMessageFor(0));
    }
  }
}
