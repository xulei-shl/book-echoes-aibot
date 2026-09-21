import { afterEach, describe, expect, it, vi } from 'vitest';
import { systemOne } from '@/lib/jev/client';
import { JevDisabledError, JevError, JevProtocolError } from '@/lib/jev/errors';
import type { Question } from '@/lib/jev/types';

const config = { apiKey: 'test-key', model: 'jev-latest', timeoutMs: 5000 };
const questions: Record<string, Question> = {
  q: { type: 'noul', instructions: '是否相关？' }
};

const goodBody = {
  model: 'jev-1.13.0',
  answers: { q: { type: 'noul', noul: 0.9 } },
  usage: { input_tokens: 10, output_tokens: 1 }
};

const invoke = (
  fetchImpl: typeof fetch,
  signal?: AbortSignal
) =>
  systemOne({ model: config.model, state: '焦虑', questions }, { config, fetchImpl, signal });

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.TYPESAFE_API_KEY;
});

describe('jev client', () => {
  it('成功时返回解码结果与计时信息', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(goodBody)) as unknown as typeof fetch;
    const result = await invoke(fetchImpl);
    expect(result.answers.q).toEqual({ type: 'noul', noul: 0.9 });
    expect(result.requestedModel).toBe('jev-latest');
    expect(result.attempts).toBe(1);
    expect(result.roundTripMs).toBeGreaterThanOrEqual(0);
  });

  it('429 重试一次后成功', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, 429))
      .mockResolvedValueOnce(jsonResponse(goodBody)) as unknown as typeof fetch;
    const result = await invoke(fetchImpl);
    expect(result.attempts).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  }, 10000);

  it('500 重试一次', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500))
      .mockResolvedValueOnce(jsonResponse(goodBody)) as unknown as typeof fetch;
    const result = await invoke(fetchImpl);
    expect(result.attempts).toBe(2);
  }, 10000);

  it('401 直接失败且不重试', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'unauthorized' }, 401)) as unknown as typeof fetch;
    await expect(invoke(fetchImpl)).rejects.toBeInstanceOf(JevError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('422 直接失败且不重试', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'bad request' }, 422)) as unknown as typeof fetch;
    await expect(invoke(fetchImpl)).rejects.toBeInstanceOf(JevError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('已 abort 时不重试也不产生第二次请求', async () => {
    const controller = new AbortController();
    controller.abort();
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const fetchImpl = vi.fn(async () => {
      throw abortError;
    }) as unknown as typeof fetch;

    await expect(invoke(fetchImpl, controller.signal)).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('错误信息绝不包含 provider body', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: 'SECRET-LEAK-TOKEN' }, 401)
    ) as unknown as typeof fetch;

    try {
      await invoke(fetchImpl);
      throw new Error('应当抛错');
    } catch (error) {
      const jevError = error as JevError;
      expect(jevError).toBeInstanceOf(JevError);
      expect(jevError.message).not.toContain('SECRET-LEAK-TOKEN');
      expect(jevError.userMessage).not.toContain('SECRET-LEAK-TOKEN');
    }
  });

  it('协议畸形时不重试（重试无意义）', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ model: 'jev-1.13.0', answers: {}, usage: {} })
    ) as unknown as typeof fetch;
    await expect(invoke(fetchImpl)).rejects.toBeInstanceOf(JevProtocolError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('未配置 TYPESAFE_API_KEY 时抛 JevDisabledError', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(
      systemOne({ model: 'jev-latest', state: 'x', questions }, { fetchImpl })
    ).rejects.toBeInstanceOf(JevDisabledError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
