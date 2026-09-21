import { FIT_GATE, MIN_RESULTS, W_FACET, W_FIT } from './config';
import type { QueryFacets, SearchDoc } from './types';

/**
 * 本地算术层：门控 + 排序 + 量化。纯代码，不调 Jev。
 *
 * 关键纪律：`relevancePct` 在**排序之前**就四舍五入到 1%，排序键直接用 `relevancePct` ——
 * 保证「用户看到的 82% 就是排序依据」。
 */

const EPS = 1e-6;

export const clip = (value: number): number => Math.min(1 - EPS, Math.max(EPS, value));
export const logOdds = (value: number): number => Math.log(clip(value) / (1 - clip(value)));

export interface RerankCandidate {
  doc: SearchDoc;
  /** choice(best).probabilities['b'+i] */
  bestProbability: number;
  /** noul fits::bN；缺失记 null（缺失 ≠ 不相关），绝不写 0 */
  fit: number | null;
  /** 原始召回名次，1-based（稳定性 tie-break） */
  recallRank: number;
  lanes: string[];
  laneScores: Record<string, number>;
  matched: string[];
  facetBonus: number;
}

export interface ScoredCandidate extends RerankCandidate {
  /** 显示值 = 排序键 */
  relevancePct: number;
  /** choice 概率百分比（与 relevancePct 严格区分，绝不互相冒充） */
  matchPct: number;
  /** 本地相对分（softmax 后） */
  rankScore: number;
}

export interface RankedOutcome {
  abstained: boolean;
  /** 通过门控的候选，已排序 */
  items: ScoredCandidate[];
  /** 未通过门控的已判分候选，同样按 relevancePct 排序；供「加载更多」分区展示（§6.5） */
  rejected: ScoredCandidate[];
}

export function callNumberClass(callNumber: string): string {
  const match = callNumber.trim().match(/^([A-Za-z])/);
  return match ? match[1].toUpperCase() : '';
}

/** 文学类（中图法 I 类）——极简但确定性的虚构信号。 */
const FICTION_CLASSES = new Set(['I']);
/** 理论性/学术性较强的类目。 */
const THEORY_CLASSES = new Set(['B', 'C', 'D', 'E', 'F', 'G', 'H', 'K', 'O', 'Q', 'R', 'T', 'X', 'Z']);

function genreMatch(doc: SearchDoc, kind: 'fiction'): number {
  return FICTION_CLASSES.has(callNumberClass(doc.exact.callNumber)) === (kind === 'fiction') ? 1 : 0;
}

function theoryScore(doc: SearchDoc): number {
  return THEORY_CLASSES.has(callNumberClass(doc.exact.callNumber)) ? 1 : 0;
}

function yearScore(pubYear: number, nowYear: number): number {
  if (!pubYear) return 0;
  const age = Math.max(0, nowYear - pubYear);
  if (age <= 5) return 1;
  return Math.max(0, 1 - (age - 5) / 10);
}

/**
 * 软过滤先验（§6.3）：只参与本地打分，不直接删结果 —— 避免「模型一票否决」。
 * 权重刻意设小（合计 ≤ 0.95，而 W_FIT=1.0 的 log_odds 量级通常 ±2），facets 只能微调。
 */
export function facetBonusFor(doc: SearchDoc, facets: QueryFacets, nowYear = new Date().getFullYear()): number {
  return (
    0.35 * (facets.wantsFiction > 0.5 ? genreMatch(doc, 'fiction') : 0) +
    0.25 * (facets.wantsRecent > 0.5 ? yearScore(doc.numeric.pubYear, nowYear) : 0) +
    0.2 * (facets.avoidTheory > 0.5 ? (theoryScore(doc) < 0.5 ? 1 : -1) : 0) +
    0.15 * (facets.wantsVerified > 0.5 ? Math.min(doc.numeric.rating / 10, 1) : 0)
  );
}

export function softmax(values: number[]): number[] {
  if (values.length === 0) return [];
  const max = Math.max(...values);
  const exps = values.map(value => Math.exp(value - max));
  const sum = exps.reduce((acc, value) => acc + value, 0);
  if (sum === 0) return values.map(() => 1 / values.length);
  return exps.map(value => value / sum);
}

/** 排序：相关度 → choice 概率 → 原始召回名次。 */
export function rank(items: RerankCandidate[]): ScoredCandidate[] {
  const utility = items.map(
    candidate =>
      Math.log(clip(candidate.bestProbability)) +
      W_FIT * logOdds(candidate.fit ?? 0) +
      W_FACET * candidate.facetBonus
  );
  const probabilities = softmax(utility);
  return items
    .map<ScoredCandidate>((candidate, index) => ({
      ...candidate,
      relevancePct: Math.round((candidate.fit ?? 0) * 100),
      matchPct: Math.round(candidate.bestProbability * 100),
      rankScore: probabilities[index]
    }))
    .sort(
      (a, b) =>
        b.relevancePct - a.relevancePct ||
        b.matchPct - a.matchPct ||
        a.recallRank - b.recallRank
    );
}

export interface EligibilityContext {
  /** choice(best).probabilities['__none__'] */
  pNone: number;
  /** noul batch_has_match；false 直接弃权 */
  batchHasMatch: boolean | null;
}

/**
 * 门控：`fit` 已返回且 ≥ 0.30，且 best.p **严格大于** p_none（平局取消）。
 * 全部出局 → abstained。
 *
 * 门控只决定**首屏主列表**显示什么，不丢弃已判分候选：未通过门控的项照常按
 * relevancePct 排序后放进 `rejected`，供「加载更多」分区展示（§6.5）。
 * 注意：`rejected` 的 rankScore 是在 rejected 子集内单独 softmax 的相对分，
 * 与 `items` 的 rankScore 不同源，两者不可直接比较。
 */
export function eligibility(candidates: RerankCandidate[], ctx: EligibilityContext): RankedOutcome {
  const eligible = candidates.filter(
    candidate =>
      candidate.fit !== null &&
      candidate.fit >= FIT_GATE &&
      candidate.bestProbability > ctx.pNone
  );
  const eligibleSet = new Set(eligible);
  const rejected = candidates.filter(candidate => !eligibleSet.has(candidate));
  const rankedRejected = rank(rejected);

  if (ctx.batchHasMatch === false || eligible.length < MIN_RESULTS) {
    return { abstained: true, items: [], rejected: rankedRejected };
  }
  return { abstained: false, items: rank(eligible), rejected: rankedRejected };
}
