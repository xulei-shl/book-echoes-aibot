import { PREFERENCE_NEUTRAL, getTuning } from './tuning';
import type { EffectiveTuning, QueryFacets, SearchDoc } from './types';

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
  /**
   * score 档位归一化后的适配度 ∈ [0,1]（fits::bN 的 score / (档数-1)）；
   * 缺失记 null（缺失 ≠ 不相关），绝不写 0。
   */
  fit: number | null;
  /** 模型判定的档位（0..3）；缺失为 null。与 fit 同源，仅用于展示 */
  fitLevel: number | null;
  /** 档位答案的置信度（概率集中度）；缺失为 null */
  fitConfidence: number | null;
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

/** 是否虚构类（中图法 I 类）。软偏好与硬过滤共用同一判定，杜绝两套标准。 */
export function isFictionDoc(doc: SearchDoc): boolean {
  return FICTION_CLASSES.has(callNumberClass(doc.exact.callNumber));
}

function genreMatch(doc: SearchDoc, kind: 'fiction'): number {
  return isFictionDoc(doc) === (kind === 'fiction') ? 1 : 0;
}

function theoryScore(doc: SearchDoc): number {
  return THEORY_CLASSES.has(callNumberClass(doc.exact.callNumber)) ? 1 : 0;
}

function yearScore(pubYear: number, nowYear: number, tuning: EffectiveTuning): number {
  if (!pubYear) return 0;
  const age = Math.max(0, nowYear - pubYear);
  if (age <= tuning.recencyFullYears) return 1;
  return Math.max(0, 1 - (age - tuning.recencyFullYears) / tuning.recencyDecayYears);
}

/** 把 0..1 的偏好（中性 = PREFERENCE_NEUTRAL）映射到 [-1,1]，让「有一点偏好」与「强烈偏好」真的不同。 */
const centered = (preference: number): number =>
  Math.max(-1, Math.min(1, (preference - PREFERENCE_NEUTRAL) * 2));

/**
 * 软过滤先验（§6.3）：只参与本地打分，不直接删结果 —— 避免「模型一票否决」。
 * 权重刻意设小（合计 ≤ `facetBonusBudget`，而 `wFit` 的 log_odds 量级通常 ±2），facets 只能微调。
 *
 * facets 现在是**连续量**（模型档位归一化而来），不再用 `> 0.5` 二值化：
 * 中性 0.5 贡献为 0，越强的偏好加成越大 —— 二值化会把 Jev 已经算出的强度白白丢掉。
 */
export function facetBonusFor(
  doc: SearchDoc,
  facets: QueryFacets,
  nowYear = new Date().getFullYear(),
  /** 调用方（pipeline）传入本次生效调参，避免每个候选重复解析环境变量 */
  tuning: EffectiveTuning = getTuning().effective
): number {
  const weights = tuning.facetWeights;
  return (
    weights.fiction * centered(facets.wantsFiction) * (genreMatch(doc, 'fiction') === 1 ? 1 : -1) +
    weights.recent * centered(facets.wantsRecent) * yearScore(doc.numeric.pubYear, nowYear, tuning) +
    weights.theory * centered(facets.avoidTheory) * (theoryScore(doc) < 0.5 ? 1 : -1) +
    weights.verified * centered(facets.wantsVerified) * Math.min(doc.numeric.rating / 10, 1)
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
export function rank(items: RerankCandidate[], tuning: EffectiveTuning = getTuning().effective): ScoredCandidate[] {
  const utility = items.map(
    candidate =>
      Math.log(clip(candidate.bestProbability)) +
      tuning.wFit * logOdds(candidate.fit ?? 0) +
      tuning.wFacet * candidate.facetBonus
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
 * 门控：`fit` 已返回且 ≥ 0.30（= score 档位 0.9/3，即至少够到「主题邻接」），
 * 且 best.p **严格大于** p_none（平局取消）。
 * 全部出局 → abstained。
 *
 * 门控只决定**首屏主列表**显示什么，不丢弃已判分候选：未通过门控的项照常按
 * relevancePct 排序后放进 `rejected`，供「加载更多」分区展示（§6.5）。
 * 注意：`rejected` 的 rankScore 是在 rejected 子集内单独 softmax 的相对分，
 * 与 `items` 的 rankScore 不同源，两者不可直接比较。
 */
export function eligibility(
  candidates: RerankCandidate[],
  ctx: EligibilityContext,
  tuning: EffectiveTuning = getTuning().effective
): RankedOutcome {
  const eligible = candidates.filter(
    candidate =>
      candidate.fit !== null &&
      candidate.fit >= tuning.fitGate &&
      candidate.bestProbability > ctx.pNone
  );
  const eligibleSet = new Set(eligible);
  const rejected = candidates.filter(candidate => !eligibleSet.has(candidate));
  const rankedRejected = rank(rejected, tuning);

  if (ctx.batchHasMatch === false || eligible.length < tuning.minResults) {
    return { abstained: true, items: [], rejected: rankedRejected };
  }
  return { abstained: false, items: rank(eligible, tuning), rejected: rankedRejected };
}
