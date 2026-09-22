import { describe, expect, it } from 'vitest';
import {
  eligibility,
  facetBonusFor,
  softmax,
  clip,
  logOdds,
  type RerankCandidate
} from '@/lib/search/rank';
import type { QueryFacets, SearchDoc } from '@/lib/search/types';

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
  it('fit < 0.30 被拒', () => {
    const outcome = eligibility([candidate('a', 0.29, 0.9)], { pNone: 0.1, batchHasMatch: true });
    expect(outcome.abstained).toBe(true);
    expect(outcome.items).toEqual([]);
  });

  it('best.p 必须严格大于 p_none（平局取消）', () => {
    const tied = eligibility([candidate('a', 0.9, 0.2)], { pNone: 0.2, batchHasMatch: true });
    expect(tied.abstained).toBe(true);
    const strict = eligibility([candidate('a', 0.9, 0.21)], { pNone: 0.2, batchHasMatch: true });
    expect(strict.abstained).toBe(false);
  });

  it('fit 缺失（null）不等于 0，但仍被门控排除', () => {
    const outcome = eligibility([candidate('a', null, 0.9)], { pNone: 0.1, batchHasMatch: true });
    expect(outcome.abstained).toBe(true);
  });

  it('batch_has_match = false 直接弃权', () => {
    const outcome = eligibility([candidate('a', 0.9, 0.9)], {
      pNone: 0.1,
      batchHasMatch: false
    });
    expect(outcome.abstained).toBe(true);
  });

  it('全部候选出局则弃权', () => {
    const outcome = eligibility(
      [candidate('a', 0.1, 0.9), candidate('b', 0.2, 0.9)],
      { pNone: 0.1, batchHasMatch: true }
    );
    expect(outcome.abstained).toBe(true);
  });

  it('relevancePct 与排序键严格一致（显示值即排序键）', () => {
    const outcome = eligibility(
      [candidate('a', 0.62, 0.5), candidate('b', 0.91, 0.2), candidate('c', 0.71, 0.4)],
      { pNone: 0.05, batchHasMatch: true }
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
      { pNone: 0.1, batchHasMatch: true }
    );
    expect(outcome.abstained).toBe(false);
    expect(outcome.items.map(item => item.doc.id)).toEqual(['a']);
    expect(outcome.rejected.map(item => item.relevancePct)).toEqual([10, 0]);
  });

  it('弃权时 rejected 仍保留已判分候选', () => {
    const outcome = eligibility([candidate('a', 0.29, 0.9)], {
      pNone: 0.1,
      batchHasMatch: true
    });
    expect(outcome.abstained).toBe(true);
    expect(outcome.items).toEqual([]);
    expect(outcome.rejected).toHaveLength(1);
  });

  it('relevancePct 与 matchPct 不互相冒充', () => {
    const outcome = eligibility([candidate('a', 0.62, 0.5)], { pNone: 0.05, batchHasMatch: true });
    expect(outcome.items[0].relevancePct).toBe(62);
    expect(outcome.items[0].matchPct).toBe(50);
  });
});
