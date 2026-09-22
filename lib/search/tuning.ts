import { FIT_LEVELS } from '@/lib/jev/questions';
import type { EffectiveTuning, SearchFields, TuningOverride, TuningRejection, TuningSnapshot } from './types';

/**
 * 检索质量调参表 —— 权重与判定阈值的**唯一来源**。
 *
 * 与 `config.ts` 的分工：
 * - 本文件（tuning.ts）：决定「排得好不好」的值 —— 权重、门槛、档位、衰减。**会被反复调**。
 * - `config.ts`：决定「系统允许多大/多久」的值 —— 截断长度、分片数量、TTL、预算上限。基本不动。
 *
 * 两条纪律：
 * 1. **阈值尽量写成与模型输出同单位的派生式**。例：门控不是魔法数 0.30，而是「0.9 个档位」再除以
 *    档位表长度 —— 以后把 `FIT_LEVELS` 从 4 档改成 5 档，门控会自己跟着动，不会静默脱钩。
 * 2. 改任何值都要跑 `tests/core/search`；`tuning.test.ts` 守护着「facets 合计 ≤ 预算」「档位表 2–10 档」
 *    「字段权重覆盖所有检索字段」这些不变量，破坏了会直接报错。
 *
 * 怎么调：先用评测集（Recall@40 / nDCG@10 / 硬条件精确率）建基线，**一次只改一组值**，
 * 无评测集时不要凭感觉调 —— 这些值互相耦合，改一个可能掩盖另一个的问题。
 *
 * 生效方式：下面这些常量是**默认值**，进程内直接生效（无热更新）。此外有一层**白名单环境变量覆盖**
 * （`getTuning()`）：线上应急调参不必重新部署，且本次生效值会随响应回传（`response.tuning`）。
 * 涉及 BM25 的改动需要重建索引（进程重启即可，索引按语料身份在内存中缓存）；
 * `FIELD_WEIGHTS` 只影响 BM25 索引，不影响已构建的向量文件。
 *
 * **哪些不允许覆盖**（写在代码里、必须走 review）：
 * - `FIELD_WEIGHTS`：影响索引构建，且必须与建库脚本 `scripts/build-search-vectors.mjs` 的字段取舍一致；
 * - `PREFERENCE_NEUTRAL` / `FACET_BONUS_BUDGET`：语义与预算约定，不是调参旋钮；
 * - `FALLBACK_*`：意图理解失败时的降级启发式，属于降级行为而非排序质量。
 */

// ── 逐本适配度门控（§6.1）────────────────────────────────────────────────────
/** 门控位置，单位 = rerank 档位（见 `FIT_LEVELS`）。0.9 ≈ 「几乎够到第 1 档：主题邻接」 */
export const FIT_GATE_POSITION = 0.9;
/** 归一化门控值：`fit = score / (档数 - 1)`，两边同单位导出，避免与档位表脱钩 */
export const FIT_GATE = FIT_GATE_POSITION / (FIT_LEVELS.length - 1);
/** 通过门控的候选少于此数即弃权（诚实说「馆藏里没有特别合适的」） */
export const MIN_RESULTS = 1;

// ── 本地排序权重（§6.1 / §6.3）──────────────────────────────────────────────
/** Jev 档位 fit 的权重（log_odds 量级通常 ±2） */
export const W_FIT = 1.0;
/** 本地软先验的总权重：刻意远小于 W_FIT，facets 只能微调 */
export const W_FACET = 0.2;
/** facets 各分项权重；越通俗/越偏虚构等偏好的加成上限 */
export const FACET_WEIGHTS = {
  /** 偏虚构（含反向：要非虚构时给虚构书扣分） */
  fiction: 0.35,
  /** 偏好近年出版 */
  recent: 0.25,
  /** 要通俗（排斥理论类类目） */
  theory: 0.2,
  /** 看重口碑（按评分） */
  verified: 0.15
} as const;
/** facets 合计上限：所有分项之和不得超过它，保证「只能微调、不能翻盘」 */
export const FACET_BONUS_BUDGET = 0.95;
/** 中性偏好值：等于它时贡献为 0，偏离越远加成越大（连续量，不做 > 0.5 二值化） */
export const PREFERENCE_NEUTRAL = 0.5;

// ── 新鲜度衰减（rank.ts::yearScore）─────────────────────────────────────────
/** 出版年距今在此范围内视为「新鲜」，满额加分 */
export const RECENCY_FULL_YEARS = 5;
/** 超过上面的年数后，每多一年衰减多少分（线性） */
export const RECENCY_DECAY_YEARS = 10;

// ── 融合（§5.4.4）──────────────────────────────────────────────────────────
/** RRF 的 k：标准默认 60，越大越平缓（名次差异被压缩） */
export const RRF_K = 60;

// ── BM25F（§4.3）───────────────────────────────────────────────────────────
/** tf 饱和参数：越大越奖励高频词 */
export const BM25_K1 = 1.2;
/** 文档长度归一化强度：0 = 不归一化，1 = 完全归一化 */
export const BM25_B = 0.75;
/**
 * 字段权重（按字段加权求和 tf）。
 * —— 与建库脚本 `scripts/build-search-vectors.mjs` 的「编码文本」字段取舍保持同一套语义。
 */
export const FIELD_WEIGHTS: Record<keyof SearchFields, number> = {
  title: 3.0,
  subtitle: 1.5,
  author: 2.0,
  translator: 0.8,
  publisher: 0.8,
  subjects: 1.0,
  reason: 1.2,
  summary: 1.0,
  toc: 0.6
};
/**
 * 词表里不存在的 term（错别字、生僻串）在**查询侧截断**时给的 IDF。
 * 它们在 BM25 里匹配不到任何倒排项；若按 `df = 0` 代入公式会拿到全语料最高的 IDF，
 * 反而把真正的稀有词挤出前 N 个名额。详见 `bm25.ts::termIdf`。
 */
export const UNSEEN_TERM_IDF = 0.1;

// ── 查询侧（§4.2.1）────────────────────────────────────────────────────────
/** 按区分度截断后保留的 term 数上限（长句压回与短查询可比的信噪比） */
export const DEFAULT_MAX_TERMS = 16;

// ── 召回规模控制 ───────────────────────────────────────────────────────────
/** deep 模式在 RERANK_TOP_K 之外多留多少候选，给 wide 结果留位置 */
export const DEEP_TOP_K_SLACK = 20;
/** `needs_wider_recall` 归一化后超过它才补发 wide（deep 模式，每片一次 Jev） */
export const WIDER_RECALL_TRIGGER = 0.5;

// ── 模型档位升级成硬过滤的门槛（§4.2.1）─────────────────────────────────────
/** `constraint_strictness` 的下限：模型要有把握说「这是硬条件」 */
export const JEV_HARD_STRICTNESS = 0.6;
/** `negation_present` 的上限：句中有否定时不采信模型给出的正向约束 */
export const JEV_NEGATION_MAX = 0.5;

// ── 降级兜底（意图理解失败时）───────────────────────────────────────────────
/** 长句判定阈值（字符数） */
export const FALLBACK_LONG_QUERY_CHARS = 10;
/** 长句更可能需要宽召回 */
export const FALLBACK_WIDER_RECALL_LONG = 0.7;
/** 短句默认不需要 */
export const FALLBACK_WIDER_RECALL_SHORT = 0.2;

// ── 环境变量覆盖层 ──────────────────────────────────────────────────────────

const ENV_PREFIX = 'SEMANTIC_SEARCH_';

interface OverrideSpec {
  /** 环境变量名 */
  env: string;
  /** 响应里回传的字段路径 */
  field: string;
  min: number;
  max: number;
  /** true 时必须是整数 */
  integer?: boolean;
  apply: (draft: EffectiveTuning, value: number) => void;
}

/**
 * 可覆盖白名单。只列真正需要应急调整的**标量**阈值；
 * 每项都带范围，越界即拒绝（并记入 `response.tuning.rejected`，绝不静默使用）。
 */
const OVERRIDABLE: OverrideSpec[] = [
  {
    env: `${ENV_PREFIX}FIT_GATE_POSITION`,
    field: 'fitGatePosition',
    min: 0,
    max: FIT_LEVELS.length - 1,
    apply: (draft, value) => {
      draft.fitGatePosition = value;
    }
  },
  { env: `${ENV_PREFIX}MIN_RESULTS`, field: 'minResults', min: 1, max: 10, integer: true, apply: (d, v) => { d.minResults = v; } },
  { env: `${ENV_PREFIX}W_FIT`, field: 'wFit', min: 0, max: 5, apply: (d, v) => { d.wFit = v; } },
  { env: `${ENV_PREFIX}W_FACET`, field: 'wFacet', min: 0, max: 5, apply: (d, v) => { d.wFacet = v; } },
  { env: `${ENV_PREFIX}FACET_WEIGHT_FICTION`, field: 'facetWeights.fiction', min: 0, max: 1, apply: (d, v) => { d.facetWeights.fiction = v; } },
  { env: `${ENV_PREFIX}FACET_WEIGHT_RECENT`, field: 'facetWeights.recent', min: 0, max: 1, apply: (d, v) => { d.facetWeights.recent = v; } },
  { env: `${ENV_PREFIX}FACET_WEIGHT_THEORY`, field: 'facetWeights.theory', min: 0, max: 1, apply: (d, v) => { d.facetWeights.theory = v; } },
  { env: `${ENV_PREFIX}FACET_WEIGHT_VERIFIED`, field: 'facetWeights.verified', min: 0, max: 1, apply: (d, v) => { d.facetWeights.verified = v; } },
  { env: `${ENV_PREFIX}RECENCY_FULL_YEARS`, field: 'recencyFullYears', min: 0, max: 50, integer: true, apply: (d, v) => { d.recencyFullYears = v; } },
  { env: `${ENV_PREFIX}RECENCY_DECAY_YEARS`, field: 'recencyDecayYears', min: 1, max: 100, integer: true, apply: (d, v) => { d.recencyDecayYears = v; } },
  { env: `${ENV_PREFIX}RRF_K`, field: 'rrfK', min: 1, max: 1000, apply: (d, v) => { d.rrfK = v; } },
  { env: `${ENV_PREFIX}BM25_K1`, field: 'bm25.k1', min: 0, max: 10, apply: (d, v) => { d.bm25.k1 = v; } },
  { env: `${ENV_PREFIX}BM25_B`, field: 'bm25.b', min: 0, max: 1, apply: (d, v) => { d.bm25.b = v; } },
  { env: `${ENV_PREFIX}UNSEEN_TERM_IDF`, field: 'unseenTermIdf', min: 0, max: 10, apply: (d, v) => { d.unseenTermIdf = v; } },
  { env: `${ENV_PREFIX}DEFAULT_MAX_TERMS`, field: 'defaultMaxTerms', min: 1, max: 64, integer: true, apply: (d, v) => { d.defaultMaxTerms = v; } },
  { env: `${ENV_PREFIX}DEEP_TOP_K_SLACK`, field: 'deepTopKSlack', min: 0, max: 200, integer: true, apply: (d, v) => { d.deepTopKSlack = v; } },
  { env: `${ENV_PREFIX}WIDER_RECALL_TRIGGER`, field: 'widerRecallTrigger', min: 0, max: 1, apply: (d, v) => { d.widerRecallTrigger = v; } },
  { env: `${ENV_PREFIX}JEV_HARD_STRICTNESS`, field: 'jevHardStrictness', min: 0, max: 1, apply: (d, v) => { d.jevHardStrictness = v; } },
  { env: `${ENV_PREFIX}JEV_NEGATION_MAX`, field: 'jevNegationMax', min: 0, max: 1, apply: (d, v) => { d.jevNegationMax = v; } }
];

const defaultsFor = (): EffectiveTuning => ({
  fitGatePosition: FIT_GATE_POSITION,
  fitGate: FIT_GATE,
  minResults: MIN_RESULTS,
  wFit: W_FIT,
  wFacet: W_FACET,
  facetWeights: { ...FACET_WEIGHTS },
  preferenceNeutral: PREFERENCE_NEUTRAL,
  facetBonusBudget: FACET_BONUS_BUDGET,
  recencyFullYears: RECENCY_FULL_YEARS,
  recencyDecayYears: RECENCY_DECAY_YEARS,
  rrfK: RRF_K,
  bm25: { k1: BM25_K1, b: BM25_B },
  unseenTermIdf: UNSEEN_TERM_IDF,
  defaultMaxTerms: DEFAULT_MAX_TERMS,
  deepTopKSlack: DEEP_TOP_K_SLACK,
  widerRecallTrigger: WIDER_RECALL_TRIGGER,
  jevHardStrictness: JEV_HARD_STRICTNESS,
  jevNegationMax: JEV_NEGATION_MAX
});

/** 只提供受调参影响的字段清单，供测试判断「哪些能被覆盖」。 */
export const OVERRIDABLE_ENV_KEYS: readonly string[] = OVERRIDABLE.map(spec => spec.env);

/**
 * 解析生效调参值：默认值 → 白名单环境变量覆盖（逐项范围校验）。
 *
 * 不缓存：每次调用读一遍 `process.env`（十几个键，微秒级，相对 Jev 的秒级往返可忽略）。
 * 不缓存的代价换来两个确定性：测试改完 env 立即生效、线上进程无需重启的重启仪式；
 * 同时也避免了「缓存过期导致线上行为和响应回传的 tuning 不一致」。
 */
export function getTuning(): TuningSnapshot {
  const effective = defaultsFor();
  const overridden: TuningOverride[] = [];
  const rejected: TuningRejection[] = [];
  let facetOverride = false;

  for (const spec of OVERRIDABLE) {
    const raw = process.env[spec.env];
    if (raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      rejected.push({ env: spec.env, raw, reason: '不是有限数字' });
      continue;
    }
    if (spec.integer && !Number.isInteger(value)) {
      rejected.push({ env: spec.env, raw, reason: '必须是整数' });
      continue;
    }
    if (value < spec.min || value > spec.max) {
      rejected.push({ env: spec.env, raw, reason: `必须在 ${spec.min}–${spec.max} 之间` });
      continue;
    }
    spec.apply(effective, value);
    overridden.push({ env: spec.env, field: spec.field, value });
    if (spec.field.startsWith('facetWeights.')) facetOverride = true;
  }

  // facets 分项被改过：整体重新校验预算，超了就把四个分项全部退回默认值（确定性、可解释）
  if (facetOverride) {
    const total = Object.values(effective.facetWeights).reduce((sum, weight) => sum + weight, 0);
    if (total > FACET_BONUS_BUDGET + 1e-9) {
      const reverted = overridden.filter(entry => entry.field.startsWith('facetWeights.'));
      for (const entry of reverted) {
        overridden.splice(overridden.indexOf(entry), 1);
        rejected.push({
          env: entry.env,
          raw: String(entry.value),
          reason: `facets 合计 ${total.toFixed(2)} 超过预算 ${FACET_BONUS_BUDGET}，四个分项全部退回默认值`
        });
      }
      effective.facetWeights = { ...FACET_WEIGHTS };
    }
  }

  // 门控由档位位置派生，保证「阈值与档位表不脱钩」这条纪律在覆盖后依然成立
  effective.fitGate = effective.fitGatePosition / (FIT_LEVELS.length - 1);

  return { effective, overridden, rejected };
}

