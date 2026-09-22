import { isFictionClc } from './clc';
import { PREFERENCE_NEUTRAL, getTuning } from './tuning';
import type {
  AppliedConstraint,
  EffectiveTuning,
  IntentType,
  QueryFacets,
  SearchDoc
} from './types';

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
  /** 首屏为空。与 `reason !== null`、`items.length === 0` 三者等价（有测试守） */
  abstained: boolean;
  /**
   * 弃权成因（`abstained === false` 时为 null）：
   * - `fit`：没有候选够到 `fit` 门（或不足 `minResults`）——换种说法描述想要的**主题**；
   * - `batch`：有候选够格，但主题型批级否决把首屏压了下来 —— 可展开低相关度结果。
   */
  reason: 'fit' | 'batch' | null;
  /** 首屏候选，已排序。`abstained` 时恒为空 */
  items: ScoredCandidate[];
  /**
   * 未上首屏的已判分候选，按 relevancePct 排序；供「加载更多」分区展示（§6.5）。
   *
   * 不变式：`items ∪ rejected` **恰好等于**传入的全部候选（不重不漏）——包括被批级否决
   * 压下来的那些（它们 `fit` 达标，绝不能被静默丢掉）。
   */
  rejected: ScoredCandidate[];
}

/** 理论性/学术性较强的一级大类（排序软偏好，不是硬判定；与改造前同一集合）。 */
const THEORY_CLASSES = new Set(['B', 'C', 'D', 'E', 'F', 'G', 'H', 'K', 'O', 'Q', 'R', 'T', 'X', 'Z']);

/**
 * 是否虚构类（中图法 I 类）。软偏好与硬过滤共用同一判定，杜绝两套标准。
 * 类号解析已收敛到 `lib/search/clc.ts`，这里只读 `doc.clc`，不再自己切字符串。
 */
export function isFictionDoc(doc: SearchDoc): boolean {
  return isFictionClc(doc.clc);
}

function genreMatch(doc: SearchDoc, kind: 'fiction'): number {
  return isFictionDoc(doc) === (kind === 'fiction') ? 1 : 0;
}

function theoryScore(doc: SearchDoc): number {
  const class1 = doc.clc.level1?.code;
  return class1 !== undefined && THEORY_CLASSES.has(class1) ? 1 : 0;
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
  /** noul batch_has_match；false 且查询是主题型时弃权（条件型查询不采信，见 `isFacetQuery`） */
  batchHasMatch: boolean | null;
  /** 条件型查询（见 `isFacetQuery`）：只用 `fit` 门，不用批级否定信号弃权 */
  facetQuery: boolean;
}

/**
 * 本次查询是**条件型**（筛选/书单：`评分大于8分的作品`、`2025年以后的作品`）
 * 还是**主题型**（`世界艺术`、`有没有讲孤独的书`）。
 *
 * 这个区分只决定一件事：要不要采信 `batch_has_match` 的否定答案。该题问的是
 * 「这批候选里有没有在**主题上**直接回应 query 的书」——对纯条件句本身是错配的问题：
 * 句子的主词是「作品」，条件由代码的硬过滤负责，模型答「没有回应主题的书」完全合理，
 * 但据此弃权会把整批**确定满足条件**的书全部藏起来（实测即如此）。
 *
 * - `list`：要的就是「一批书」，天然不是单一主题诉求 → 条件型；
 * - `concept` / `similar` / `work`：诉求本身就是主题或某一本书 → 主题型；
 * - `other`（模型无法判断）：只有句子里真的解析出了硬条件才按条件型处理，
 *   避免在意图不明时把唯一的批级否定信号也关掉。
 */
export function isFacetQuery(intent: IntentType, applied: AppliedConstraint[]): boolean {
  if (intent === 'list') return true;
  if (intent === 'concept' || intent === 'similar' || intent === 'work') return false;
  return applied.length > 0;
}

/**
 * 门控：逐本 `fit` 已返回且 ≥ `fitGate`（= 档位 0.9 的位置，即至少够到「主题邻接」）。
 * 全部出局 → abstained。
 *
 * ⚠️ 这里**不再**用 `choice(best).p > p_none` 做门控。那个比较只在候选集很小时成立：
 * `best` 是 K+1 选一的**互斥**分布，K = 40 时单本概率上限被摊薄到个位数百分比，
 * 而 `__none__` 是**一个**聚合桶、只需赢过最大的那一本 —— 于是「有多本都相关」会被
 * 系统性地判成「一本都不相关」，整批弃权。SkillRanker 的 rerank shortlist 是 ≤ 8
 * （`docs/jev-docs/projects/skillranker-usage-reference/ANALYSIS.md` §3.2），
 * 这个尺度假设没有跟着搬过来。`best` 概率仍然参与排序（`rank` 的 utility）与展示
 * （`matchPct` / `why.pNone`），只是不再当弃权门。
 *
 * 真正的弃权信号是 `fit`：逐本独立判定，「部分相关」与「直接回应」能区分开 ——
 * 这正是 `fits::bN` 逐本独立（而非互斥排序）的意义（§5.3）。
 *
 * 门控只决定**首屏**显示什么：`items ∪ rejected` 恰好等于传入的全部候选（不重不漏），
 * 未上首屏的项照常按 relevancePct 排序后放进 `rejected`，供「加载更多」分区展示（§6.5）。
 * 所以**被批级否决压下来的候选也在 `rejected` 里**（它们 fit 达标，不能「哪都不显示」）。
 * `abstained` 只表示「首屏为空」这一件事，不用它表达「馆藏里没有相关的书」。
 *
 * 注意：`rejected` 的 rankScore 是在 rejected 子集内单独 softmax 的相对分，
 * 与 `items` 的 rankScore 不同源，两者不可直接比较。
 */
export function eligibility(
  candidates: RerankCandidate[],
  ctx: EligibilityContext,
  tuning: EffectiveTuning = getTuning().effective
): RankedOutcome {
  const eligible = candidates.filter(
    candidate => candidate.fit !== null && candidate.fit >= tuning.fitGate
  );

  // 主题型的批级否定只压制**首屏**，不否定逐本的 fit 判定（被压下来的照样进 rejected）
  const batchVetoed = ctx.batchHasMatch === false && !ctx.facetQuery;
  // 两种成因互斥，且只在真的扣下了候选时才算 'batch'：一本都不够格时，原因就是不够格
  const reason: RankedOutcome['reason'] =
    eligible.length < tuning.minResults ? 'fit' : batchVetoed ? 'batch' : null;
  const items = reason === null ? eligible : [];

  const shown = new Set(items);
  const rejected = candidates.filter(candidate => !shown.has(candidate));

  return {
    abstained: reason !== null,
    reason,
    items: rank(items, tuning),
    rejected: rank(rejected, tuning)
  };
}
