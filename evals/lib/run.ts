import { resetPipelineState, runSemanticSearch } from '@/lib/search/pipeline';
import { isFictionDoc } from '@/lib/search/rank';
import type { SearchDoc } from '@/lib/search/types';
import type { JudgeFn } from '@/lib/search/pipeline';
import { stubJudge } from './judge';
import { EXPECTED_DEGRADED, type CaseOutcome, type ConstraintField, type QueryCase } from './types';

/**
 * 用例运行器。
 *
 * 三条刻意的纪律（写进代码，不靠人记得）：
 * 1. **每个用例前清空管线缓存** —— 否则意图缓存会让第二个用例复用第一个的模型结论，
 *    评测就变成了「测缓存」。
 * 2. **强制注入冻结的 `now`** —— 相对时间用例（「近三年」）否则每年答案都变。
 * 3. **降级必须为空**（除预期内的 dense-unavailable）—— 测到降级路径就说明这条数据不该算分。
 */

export interface RunOptions {
  /** 覆盖 judge（例如 cassette 回放）；缺省用中性 stub */
  judge?: JudgeFn;
  /** 关闭稠密 lane（离线评测默认开启：无 key 时它本来就不可用） */
  vectors?: null;
}

function computeViolations(
  ranked: string[],
  docs: Map<string, SearchDoc>,
  expected: QueryCase['expectApplied']
): string[] {
  if (!expected) return [];
  const violations: string[] = [];
  for (const docId of ranked) {
    const doc = docs.get(docId);
    if (!doc) continue;
    if (expected.pubYearFrom !== undefined && typeof expected.pubYearFrom === 'number') {
      // 出版年未知（0）的书豁免 —— 与 applyFilters 的策略一致，不是漏网
      if (doc.numeric.pubYear > 0 && doc.numeric.pubYear < expected.pubYearFrom) {
        violations.push(docId);
        continue;
      }
    }
    if (expected.minRating !== undefined && typeof expected.minRating === 'number') {
      if (doc.numeric.rating > 0 && doc.numeric.rating < expected.minRating) {
        violations.push(docId);
        continue;
      }
    }
    if (expected.excludeFiction === true && isFictionDoc(doc)) {
      violations.push(docId);
    }
  }
  return violations;
}

export async function runCase(
  testCase: QueryCase,
  corpus: SearchDoc[],
  options: RunOptions = {}
): Promise<CaseOutcome> {
  resetPipelineState();
  const stub = options.judge ? null : stubJudge();
  const judge = options.judge ?? stub!.judge;
  const calls = stub?.calls ?? [];
  const docs = new Map(corpus.map(doc => [doc.id, doc]));
  const frozen = new Date(testCase.frozenNow);

  try {
    const response = await runSemanticSearch(
      { query: testCase.query, mode: testCase.mode, limit: 20 },
      { judge, corpus, vectors: options.vectors ?? null, model: 'eval-stub', now: () => frozen }
    );

    const items = [...response.results, ...response.more];
    const ranked = items.map(item => item.book.id);
    const fits = Object.fromEntries(items.map(item => [item.book.id, item.fit]));

    const applied: Partial<Record<ConstraintField, number | boolean>> = {};
    for (const entry of response.intent.plan.applied) {
      applied[entry.field] = entry.value;
    }

    return {
      case: testCase,
      basedOn: response.basedOn,
      abstained: response.abstained,
      ranked,
      fits,
      applied,
      droppedCount: response.intent.plan.dropped.length,
      degraded: response.degraded,
      violations: computeViolations(ranked, docs, testCase.expectApplied),
      judgeCalls: calls.length,
      timingMs: response.timing.totalMs
    };
  } catch (error) {
    return {
      case: testCase,
      basedOn: 'error',
      abstained: false,
      ranked: [],
      fits: {},
      applied: {},
      droppedCount: 0,
      degraded: [],
      violations: [],
      judgeCalls: calls.length,
      timingMs: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/** 确定性断言（与排序质量无关）：违反即回归，进 CI 当门。 */
export function assertCase(outcome: CaseOutcome): string[] {
  const failures: string[] = [];
  const { case: testCase } = outcome;
  const label = `${testCase.id}（${testCase.query}）`;

  if (outcome.error) {
    failures.push(`${label}: 运行报错 → ${outcome.error}`);
    return failures;
  }

  for (const code of outcome.degraded) {
    if (!EXPECTED_DEGRADED.has(code)) {
      failures.push(`${label}: 出现非预期降级 ${code}（该数据不应参与评分，需重跑）`);
    }
  }

  if (testCase.expectBasedOnExact !== undefined) {
    const want = testCase.expectBasedOnExact ? 'exact' : 'retrieval';
    if (outcome.basedOn !== want) {
      failures.push(`${label}: basedOn 期望 ${want}，实际 ${outcome.basedOn}`);
    }
  }
  if (testCase.expectBasedOnExact === true && outcome.judgeCalls !== 0) {
    failures.push(`${label}: 精确命中必须 0 次 Jev，实际 ${outcome.judgeCalls} 次`);
  }

  for (const [field, expected] of Object.entries(testCase.expectApplied ?? {})) {
    const actual = outcome.applied[field as ConstraintField];
    if (actual !== expected) {
      failures.push(`${label}: 硬条件 ${field} 期望 ${String(expected)}，实际 ${String(actual)}`);
    }
  }
  for (const field of testCase.expectNotApplied ?? []) {
    if (outcome.applied[field] !== undefined) {
      failures.push(
        `${label}: 硬条件 ${field} 不该生效（被否定/上界守卫拦下），实际生效为 ${String(outcome.applied[field])}`
      );
    }
  }

  if (testCase.expectAbstain !== undefined && outcome.abstained !== testCase.expectAbstain) {
    failures.push(`${label}: abstained 期望 ${testCase.expectAbstain}，实际 ${outcome.abstained}`);
  }

  if (outcome.violations.length > 0) {
    failures.push(
      `${label}: ${outcome.violations.length} 本不该放行的书通过了硬条件 → ${outcome.violations.slice(0, 5).join(', ')}`
    );
  }

  return failures;
}
