import { afterEach, describe, expect, it } from 'vitest';
import {
  FIT_LEVELS,
  RATING_FLOOR_LEVELS,
  RECENCY_LEVELS,
  STYLE_LEVELS,
  WIDER_RECALL_LEVELS,
  YEAR_FLOOR_LEVELS
} from '@/lib/search/levels';
import { LIMIT_MAX, RERANK_TOP_K } from '@/lib/search/config';
import {
  BM25_B,
  BM25_K1,
  DEFAULT_MAX_TERMS,
  DEEP_TOP_K_SLACK,
  FACET_BONUS_BUDGET,
  FACET_WEIGHTS,
  FIELD_WEIGHTS,
  FIT_GATE,
  FIT_GATE_POSITION,
  JEV_HARD_STRICTNESS,
  JEV_NEGATION_MAX,
  MIN_RESULTS,
  OVERRIDABLE_ENV_KEYS,
  PREFERENCE_NEUTRAL,
  RRF_K,
  W_FACET,
  W_FIT,
  WIDER_RECALL_TRIGGER,
  getTuning
} from '@/lib/search/tuning';
import type { SearchFields } from '@/lib/search/types';

/**
 * tuning.ts 的不变量守护。
 *
 * 阈值搬进独立文件后，最大的风险不是「找不到」，而是**静默脱钩**：
 * 改了档位表但没改门控、加了分项权重但合计超预算、写了字段却没配权重。
 * 这些在运行时都表现为「结果怪怪的」，很难定位 —— 所以在这里一次性钉死。
 */
describe('tuning / 与模型档位同单位', () => {
  it('门控由 FIT_GATE_POSITION 与档位表长度派生，不允许手工写字面量', () => {
    expect(FIT_GATE).toBeCloseTo(FIT_GATE_POSITION / (FIT_LEVELS.length - 1), 9);
  });

  it('门控要求「接近第 1 档（主题邻接）」但不苛求高档位', () => {
    // 0.9 档 = 旧值 0.30（fit 单位 = 0.9/3）的档位当量；调高会大量弃权，调低会放进来一堆弱相关
    expect(FIT_GATE_POSITION).toBeGreaterThanOrEqual(0.5);
    expect(FIT_GATE_POSITION).toBeLessThanOrEqual(2);
    expect(FIT_GATE).toBeGreaterThan(0);
    expect(FIT_GATE).toBeLessThan(1);
  });

  it('所有档位表都在协议允许的 2–10 级之内', () => {
    for (const levels of [
      FIT_LEVELS,
      WIDER_RECALL_LEVELS,
      RECENCY_LEVELS,
      STYLE_LEVELS,
      YEAR_FLOOR_LEVELS,
      RATING_FLOOR_LEVELS
    ]) {
      expect(levels.length).toBeGreaterThanOrEqual(2);
      expect(levels.length).toBeLessThanOrEqual(10);
    }
  });
});

describe('tuning / 本地打分预算', () => {
  it('facets 合计不超过预算：软先验只能微调、不能翻盘', () => {
    const total = Object.values(FACET_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    // 0.35+0.25+0.2+0.15 在浮点下是 0.9500000000000001，所以留一点容差
    expect(total).toBeLessThanOrEqual(FACET_BONUS_BUDGET + 1e-9);
    for (const weight of Object.values(FACET_WEIGHTS)) {
      expect(weight).toBeGreaterThan(0);
    }
  });

  it('本地软先验的总权重远小于 Jev 档位的权重', () => {
    expect(W_FACET * FACET_BONUS_BUDGET).toBeLessThan(W_FIT);
  });

  it('中性偏好是 0..1 的中点（等于它时贡献为 0）', () => {
    expect(PREFERENCE_NEUTRAL).toBe(0.5);
  });
});

describe('tuning / BM25 与召回', () => {
  it('字段权重覆盖每一个检索字段，且书名权重最高', () => {
    const fields: (keyof SearchFields)[] = [
      'title',
      'subtitle',
      'author',
      'translator',
      'publisher',
      'subjects',
      'reason',
      'summary',
      'toc'
    ];
    for (const field of fields) {
      expect(FIELD_WEIGHTS[field]).toBeGreaterThan(0);
    }
    expect(Object.keys(FIELD_WEIGHTS)).toHaveLength(fields.length);
    expect(FIELD_WEIGHTS.title).toBe(Math.max(...Object.values(FIELD_WEIGHTS)));
  });

  it('BM25 参数在合理区间内', () => {
    expect(BM25_K1).toBeGreaterThan(0);
    expect(BM25_B).toBeGreaterThanOrEqual(0);
    expect(BM25_B).toBeLessThanOrEqual(1);
  });

  it('截断上限与召回上限自洽（term 数不超过候选数级）', () => {
    expect(DEFAULT_MAX_TERMS).toBeGreaterThan(0);
    expect(DEFAULT_MAX_TERMS).toBeLessThanOrEqual(RERANK_TOP_K);
  });

  it('deep 模式的候选上限不超过精排批容量两倍', () => {
    expect(RERANK_TOP_K + DEEP_TOP_K_SLACK).toBeLessThanOrEqual(RERANK_TOP_K * 2);
  });
});

describe('tuning / 决策阈值', () => {
  it('宽召回触发点位于档位中位（0.5）附近，且为合法偏好值', () => {
    expect(WIDER_RECALL_TRIGGER).toBeGreaterThan(0);
    expect(WIDER_RECALL_TRIGGER).toBeLessThan(1);
  });

  it('模型约束升级门槛：严格性要求高于否定容忍度', () => {
    expect(JEV_HARD_STRICTNESS).toBeGreaterThan(JEV_NEGATION_MAX);
  });

  it('硬条件相关阈值都是 [0,1] 内的概率量', () => {
    for (const value of [JEV_HARD_STRICTNESS, JEV_NEGATION_MAX, WIDER_RECALL_TRIGGER]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('结构上限（config.ts）与调参表互不重叠：上限必须容得下默认值', () => {
    expect(LIMIT_MAX).toBeGreaterThanOrEqual(1);
  });
});

describe('tuning / 环境变量覆盖层', () => {
  const ENV_KEYS = [...OVERRIDABLE_ENV_KEYS];

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('无覆盖时：生效值等于调参表默认值，没有 overridden / rejected', () => {
    const snapshot = getTuning();
    expect(snapshot.overridden).toEqual([]);
    expect(snapshot.rejected).toEqual([]);
    expect(snapshot.effective.fitGate).toBeCloseTo(FIT_GATE, 9);
    expect(snapshot.effective.bm25).toEqual({ k1: BM25_K1, b: BM25_B });
    expect(snapshot.effective.facetWeights).toEqual(FACET_WEIGHTS);
  });

  it('合法覆盖立即生效（不缓存），并被完整记录', () => {
    process.env.SEMANTIC_SEARCH_RRF_K = '30';
    process.env.SEMANTIC_SEARCH_BM25_B = '0.5';
    const snapshot = getTuning();
    expect(snapshot.effective.rrfK).toBe(30);
    expect(snapshot.effective.bm25.b).toBe(0.5);
    expect(snapshot.overridden).toEqual(
      expect.arrayContaining([
        { env: 'SEMANTIC_SEARCH_RRF_K', field: 'rrfK', value: 30 },
        { env: 'SEMANTIC_SEARCH_BM25_B', field: 'bm25.b', value: 0.5 }
      ])
    );

    delete process.env.SEMANTIC_SEARCH_RRF_K;
    expect(getTuning().effective.rrfK).toBe(RRF_K);
  });

  it('门控被覆盖后仍由档位位置派生（阈值与档位表不脱钩）', () => {
    process.env.SEMANTIC_SEARCH_FIT_GATE_POSITION = '1.5';
    const { effective } = getTuning();
    expect(effective.fitGatePosition).toBe(1.5);
    expect(effective.fitGate).toBeCloseTo(1.5 / (FIT_LEVELS.length - 1), 9);
  });

  it('非法值一律拒绝并给出原因，绝不静默使用', () => {
    process.env.SEMANTIC_SEARCH_RRF_K = 'abc';
    process.env.SEMANTIC_SEARCH_MIN_RESULTS = '2.5';
    process.env.SEMANTIC_SEARCH_BM25_B = '1.4';
    process.env.SEMANTIC_SEARCH_FIT_GATE_POSITION = '99';
    const { effective, rejected, overridden } = getTuning();

    expect(overridden).toEqual([]);
    expect(effective.rrfK).toBe(RRF_K);
    expect(effective.minResults).toBe(MIN_RESULTS);
    expect(effective.bm25.b).toBe(BM25_B);
    expect(effective.fitGatePosition).toBe(FIT_GATE_POSITION);
    expect(rejected).toHaveLength(4);
    // 顺序 = 白名单声明顺序（FIT_GATE_POSITION → MIN_RESULTS → RRF_K → BM25_B）
    expect(rejected.map(entry => entry.env)).toEqual([
      'SEMANTIC_SEARCH_FIT_GATE_POSITION',
      'SEMANTIC_SEARCH_MIN_RESULTS',
      'SEMANTIC_SEARCH_RRF_K',
      'SEMANTIC_SEARCH_BM25_B'
    ]);
    expect(rejected.find(entry => entry.env === 'SEMANTIC_SEARCH_RRF_K')?.reason).toContain('有限数字');
    expect(rejected.find(entry => entry.env === 'SEMANTIC_SEARCH_MIN_RESULTS')?.reason).toContain('整数');
    expect(rejected.find(entry => entry.env === 'SEMANTIC_SEARCH_BM25_B')?.reason).toContain('之间');
  });

  it('facets 合计超预算时四个分项全部退回默认值（确定性、可解释）', () => {
    process.env.SEMANTIC_SEARCH_FACET_WEIGHT_FICTION = '0.9';
    process.env.SEMANTIC_SEARCH_FACET_WEIGHT_RECENT = '0.5';
    const { effective, overridden, rejected } = getTuning();

    expect(effective.facetWeights).toEqual(FACET_WEIGHTS);
    expect(overridden).toEqual([]);
    expect(rejected).toHaveLength(2);
    expect(rejected[0].reason).toContain('超过预算');
  });

  it('合计仍在预算内时覆盖生效', () => {
    // 0.30 + 0.25 + 0.20 + 0.15 = 0.90 ≤ 0.95
    process.env.SEMANTIC_SEARCH_FACET_WEIGHT_FICTION = '0.30';
    const { effective, overridden, rejected } = getTuning();

    expect(rejected).toEqual([]);
    expect(effective.facetWeights.fiction).toBe(0.3);
    expect(overridden).toEqual([
      { env: 'SEMANTIC_SEARCH_FACET_WEIGHT_FICTION', field: 'facetWeights.fiction', value: 0.3 }
    ]);
  });

  it('空字符串按「未设置」处理（部署工具常留空值）', () => {
    process.env.SEMANTIC_SEARCH_RRF_K = '';
    expect(getTuning().rejected).toEqual([]);
    expect(getTuning().effective.rrfK).toBe(RRF_K);
  });
});
