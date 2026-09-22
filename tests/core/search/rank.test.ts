import { describe, expect, it } from 'vitest';
import {
  eligibility,
  facetBonusFor,
  isFacetQuery,
  softmax,
  clip,
  logOdds,
  type RankedOutcome,
  type RerankCandidate
} from '@/lib/search/rank';
import { FIT_GATE } from '@/lib/search/tuning';
import type { AppliedConstraint, QueryFacets, SearchDoc } from '@/lib/search/types';

function makeDoc(id: string, options: { callNumber?: string; rating?: number; pubYear?: number } = {}): SearchDoc {
  return {
    id,
    sourceId: '2026-06',
    book: {
      id,
      month: '2026-06',
      title: id,
      author: '',
      publisher: '',
      pubYear: String(options.pubYear ?? 2020),
      pages: '',
      rating: String(options.rating ?? 8),
      callNumber: options.callNumber ?? '',
      callNumberLink: '',
      isbn: '',
      recommendation: '',
      summary: '',
      authorIntro: '',
      catalog: '',
      coverUrl: ''
    },
    fields: {
      title: id,
      subtitle: '',
      author: '',
      translator: '',
      publisher: '',
      subjects: '',
      reason: '',
      summary: '',
      toc: ''
    },
    exact: { isbn: '', barcode: id, callNumber: options.callNumber ?? '' },
    numeric: { rating: options.rating ?? 8, pubYear: options.pubYear ?? 2020, pages: 0 },
    hash: id
  };
}

/**
 * 门控的两条不变式（`abstained` 与「加载更多」的语义就靠它们统一）：
 * 1. `abstained ⟺ reason !== null ⟺ items 为空`；
 * 2. `items ∪ rejected` 恰好等于全部已判分候选，不重不漏 —— 不能有候选「哪都不显示」。
 */
function expectPartition(outcome: RankedOutcome, candidates: RerankCandidate[]): void {
  expect(outcome.abstained).toBe(outcome.reason !== null);
  expect(outcome.abstained).toBe(outcome.items.length === 0);
  const all = [...outcome.items, ...outcome.rejected];
  expect(all).toHaveLength(candidates.length);
  expect(new Set(all).size).toBe(candidates.length);
}

function candidate(
  id: string,
  fit: number | null,
  bestProbability: number,
  recallRank = 1
): RerankCandidate {
  return {
    doc: makeDoc(id),
    fit,
    fitLevel: fit === null ? null : Math.round(fit * 3),
    fitConfidence: null,
    bestProbability,
    recallRank,
    lanes: ['lexical'],
    laneScores: {},
    matched: [],
    facetBonus: 0
  };
}

describe('rank / softmax', () => {
  it('归一化后和为 1', () => {
    const probs = softmax([1, 2, 3]);
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('clip 与 logOdds 处理边界值', () => {
    expect(clip(0)).toBeGreaterThan(0);
    expect(clip(1)).toBeLessThan(1);
    expect(Number.isFinite(logOdds(0))).toBe(true);
    expect(Number.isFinite(logOdds(1))).toBe(true);
  });
});

const NEUTRAL: QueryFacets = {
  wantsFiction: 0.5,
  wantsRecent: 0.5,
  avoidTheory: 0.5,
  wantsVerified: 0.5
};

describe('rank / facetBonusFor（连续 facets）', () => {
  it('中性 0.5 贡献为 0，不给任何书白送加成', () => {
    expect(facetBonusFor(makeDoc('fiction', { callNumber: 'I247.5' }), NEUTRAL, 2026)).toBeCloseTo(0);
    expect(facetBonusFor(makeDoc('theory', { callNumber: 'B842' }), NEUTRAL, 2026)).toBeCloseTo(0);
  });

  it('偏好强度连续生效，不再用 > 0.5 二值化', () => {
    const mild = facetBonusFor(
      makeDoc('f', { callNumber: 'I247.5' }),
      { ...NEUTRAL, wantsFiction: 0.75 },
      2026
    );
    const strong = facetBonusFor(
      makeDoc('f', { callNumber: 'I247.5' }),
      { ...NEUTRAL, wantsFiction: 1 },
      2026
    );
    expect(mild).toBeGreaterThan(0);
    expect(strong).toBeGreaterThan(mild);
  });

  it('要非虚构时，I 类虚构书反而被扣分', () => {
    const bonus = facetBonusFor(
      makeDoc('f', { callNumber: 'I247.5' }),
      { ...NEUTRAL, wantsFiction: 0 },
      2026
    );
    expect(bonus).toBeLessThan(0);
  });

  it('越通俗越好时，理论类类目被扣分、非理论类加分', () => {
    const facets = { ...NEUTRAL, avoidTheory: 1 };
    expect(facetBonusFor(makeDoc('t', { callNumber: 'B842' }), facets, 2026)).toBeLessThan(0);
    expect(facetBonusFor(makeDoc('n', { callNumber: 'I247.5' }), facets, 2026)).toBeGreaterThan(0);
  });
});

describe('rank / eligibility', () => {
  /** 主题型查询（batch_has_match 是否定信号） */
  const topical = { batchHasMatch: true, facetQuery: false };
  /** 条件型查询（只看 fit 门） */
  const facet = { batchHasMatch: true, facetQuery: true };

  it('fit < 0.30 被拒', () => {
    const outcome = eligibility([candidate('a', 0.29, 0.9)], topical);
    expect(outcome.abstained).toBe(true);
    expect(outcome.items).toEqual([]);
  });

  it('best.p 不再是门控：输给 __none__ 的候选照样入围', () => {
    // 回归（世界艺术 / 评分大于8分的作品）：choice(best) 是 K+1 选一的**互斥**分布，
    // K=40 时单本概率被摊薄到个位数百分比，而 __none__ 是**一个**聚合桶；
    // 用 best.p > p_none 当门控会把「有多本都相关」系统性判成「一本都不相关」
    const outcome = eligibility([candidate('a', 0.68, 0.001)], topical);
    expect(outcome.abstained).toBe(false);
    expect(outcome.items.map(item => item.doc.id)).toEqual(['a']);
  });

  it('fit 缺失（null）不等于 0，但仍被门控排除', () => {
    const outcome = eligibility([candidate('a', null, 0.9)], topical);
    expect(outcome.abstained).toBe(true);
  });

  it('batch_has_match = false 且查询是主题型时弃权，但候选进 rejected 而不是消失', () => {
    const candidates = [candidate('a', 0.9, 0.9), candidate('b', 0.5, 0.2)];
    const outcome = eligibility(candidates, { batchHasMatch: false, facetQuery: false });
    expect(outcome.abstained).toBe(true);
    expect(outcome.reason).toBe('batch');
    expect(outcome.items).toEqual([]);
    // 回归：它们 fit 达标，只是首屏被压下来 —— 必须能从「加载更多」拿到
    expect(outcome.rejected.map(item => item.doc.id).sort()).toEqual(['a', 'b']);
    expect(outcome.rejected.every(item => item.fit !== null && item.fit >= FIT_GATE)).toBe(true);
    expectPartition(outcome, candidates);
  });

  it('batch_has_match = false 但查询是条件型时不弃权（同一条答案不再被反向采信）', () => {
    const candidates = [candidate('a', 0.9, 0.01)];
    const outcome = eligibility(candidates, { batchHasMatch: false, facetQuery: true });
    expect(outcome.abstained).toBe(false);
    expect(outcome.reason).toBeNull();
    expect(outcome.items.map(item => item.doc.id)).toEqual(['a']);
    expectPartition(outcome, candidates);
  });

  it('全部候选出局则弃权，reason = fit', () => {
    const candidates = [candidate('a', 0.1, 0.9), candidate('b', 0.2, 0.9)];
    const outcome = eligibility(candidates, topical);
    expect(outcome.abstained).toBe(true);
    expect(outcome.reason).toBe('fit');
    expectPartition(outcome, candidates);
  });

  it('一本都不够格时，即便批级也否决，reason 仍是 fit（没有候选被扣下）', () => {
    const outcome = eligibility([candidate('a', 0.1, 0.9)], {
      batchHasMatch: false,
      facetQuery: false
    });
    expect(outcome.reason).toBe('fit');
  });

  it('relevancePct 与排序键严格一致（显示值即排序键）', () => {
    const outcome = eligibility(
      [candidate('a', 0.62, 0.5), candidate('b', 0.91, 0.2), candidate('c', 0.71, 0.4)],
      topical
    );
    expect(outcome.abstained).toBe(false);
    expect(outcome.items.map(item => item.relevancePct)).toEqual([91, 71, 62]);
    for (let i = 1; i < outcome.items.length; i += 1) {
      expect(outcome.items[i - 1].relevancePct).toBeGreaterThanOrEqual(outcome.items[i].relevancePct);
    }
    expect(outcome.items.reduce((sum, item) => sum + item.rankScore, 0)).toBeCloseTo(1, 10);
  });

  it('未通过门控的候选进入 rejected（不丢弃），按 relevancePct 降序', () => {
    const outcome = eligibility(
      [candidate('a', 0.9, 0.9), candidate('b', 0.1, 0.9), candidate('c', null, 0.9)],
      topical
    );
    expect(outcome.abstained).toBe(false);
    expect(outcome.items.map(item => item.doc.id)).toEqual(['a']);
    expect(outcome.rejected.map(item => item.relevancePct)).toEqual([10, 0]);
  });

  it('弃权时 rejected 仍保留已判分候选', () => {
    const outcome = eligibility([candidate('a', 0.29, 0.9)], topical);
    expect(outcome.abstained).toBe(true);
    expect(outcome.reason).toBe('fit');
    expect(outcome.items).toEqual([]);
    expect(outcome.rejected).toHaveLength(1);
  });

  it('relevancePct 与 matchPct 不互相冒充', () => {
    const outcome = eligibility([candidate('a', 0.62, 0.5)], topical);
    expect(outcome.items[0].relevancePct).toBe(62);
    expect(outcome.items[0].matchPct).toBe(50);
  });

  it('条件型查询的 fit 门与主题型完全一致（不额外放宽）', () => {
    const outcome = eligibility([candidate('a', 0.29, 0.9)], facet);
    expect(outcome.abstained).toBe(true);
    expect(outcome.rejected).toHaveLength(1);
  });
});

describe('isFacetQuery', () => {
  const applied: AppliedConstraint[] = [{ field: 'minRating', value: 8, source: 'rule' }];

  it('list（要一批书）一律算条件型', () => {
    expect(isFacetQuery('list', [])).toBe(true);
    expect(isFacetQuery('list', applied)).toBe(true);
  });

  it('concept / similar / work 一律算主题型，即便句中有硬条件', () => {
    for (const intent of ['concept', 'similar', 'work'] as const) {
      expect(isFacetQuery(intent, applied)).toBe(false);
    }
  });

  it('意图不明时，只有真的解析出硬条件才算条件型', () => {
    expect(isFacetQuery('other', [])).toBe(false);
    expect(isFacetQuery('other', applied)).toBe(true);
  });
});
