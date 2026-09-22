import { JUDGE_CACHE_TTL_MS, jevBudgetPerMinute } from './config';

/**
 * Jev 调用的**进程级**状态：结果缓存与每分钟预算。
 *
 * 与 pipeline 分开的理由：这两者都是跨请求的模块级可变状态，失效方式（TTL、
 * 一分钟滑动窗口）与检索编排毫无关系。混在编排文件里时，「这个函数有没有副作用」
 * 需要通读全文才能回答。
 */

// ── 进程级 Jev 预算（§9-R11）：超限即降级，避免高峰期被 429 打穿 ─────────────
const budgetTimestamps: number[] = [];

export const budget = {
  tryConsume(count: number): boolean {
    const now = Date.now();
    while (budgetTimestamps.length > 0 && now - budgetTimestamps[0] > 60_000) {
      budgetTimestamps.shift();
    }
    if (budgetTimestamps.length + count > jevBudgetPerMinute()) return false;
    for (let i = 0; i < count; i += 1) budgetTimestamps.push(now);
    return true;
  }
};

// ── 简易 TTL 缓存（§7.2）────────────────────────────────────────────────────
const judgeCache = new Map<string, { expiresAt: number; value: unknown }>();

export function cacheGet<T>(key: string): T | undefined {
  const entry = judgeCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    judgeCache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSet(key: string, value: unknown): void {
  judgeCache.set(key, { expiresAt: Date.now() + JUDGE_CACHE_TTL_MS, value });
}

/** 测试与评测用：清空预算窗口与缓存。 */
export function resetPipelineState(): void {
  budgetTimestamps.length = 0;
  judgeCache.clear();
}
