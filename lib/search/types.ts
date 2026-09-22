import type { Book } from '@/types';

/**
 * 检索专用字段集合。分词后按字段加权送入 BM25（权重见 tuning.ts::FIELD_WEIGHTS）。
 * 与建库脚本 scripts/build-search-vectors.mjs 的「编码文本」字段取舍保持同一套语义。
 */
export interface SearchFields {
  title: string;
  subtitle: string;
  author: string;
  translator: string;
  publisher: string;
  /** 索书号类目 + 丛书 + 出品方，拼接后的短文本 */
  subjects: string;
  /** 初评理由：馆藏自写的主题判断，语义密度最高 */
  reason: string;
  summary: string;
  toc: string;
}

export interface SearchDoc {
  /** 书目条码，唯一键 */
  id: string;
  /** 归档 id，即详情页路由参数 */
  sourceId: string;
  /** 规范 Book（types/index.ts），含已解析的封面 URL */
  book: Book;
  fields: SearchFields;
  exact: { isbn: string; barcode: string; callNumber: string };
  numeric: { rating: number; pubYear: number; pages: number };
  /** 内容指纹，用于缓存失效与「模型看到的是哪一版」 */
  hash: string;
  /** 同一本书出现在多个归档时，其余来源（R6） */
  alsoIn?: string[];
}

export interface ScoredDoc {
  docId: string;
  score: number;
  /** 命中的 query term，供可解释面板展示 */
  matched: string[];
}

/** 两条 lane 的统一召回结果 */
export interface RecallResult {
  docId: string;
  /** 融合后的名次分（RRF），非原始分数 */
  score: number;
  /** 命中该 doc 的 lane id 列表 */
  lanes: string[];
  matched: string[];
  /** lane id → 该 lane 的原始分数 */
  laneScores: Record<string, number>;
}

export type LaneId = 'lexical' | 'dense' | 'external';

/** 召回层抽象：将来接第三条（外部服务）是加法而非重写（§4.5） */
export interface RecallLane {
  id: LaneId;
  search(ctx: { raw: string; core: string[]; limit: number }): Promise<RecallResult[]>;
}

export interface SearchFilters {
  minRating?: number;
  pubYearFrom?: number;
  /** 排除虚构类（中图法 I 类）。请求显式传入或查询句解析出「不要小说」时生效 */
  excludeFiction?: boolean;
}

export type SearchMode = 'fast' | 'deep';

export interface SearchInput {
  query: string;
  mode?: SearchMode;
  limit?: number;
  filters?: SearchFilters;
}

export type IntentType = 'concept' | 'work' | 'similar' | 'list' | 'other';

/**
 * 软过滤先验，只参与本地打分（§6.3），不直接删结果。
 *
 * 取值语义（**连续量**，0.5 = 中性；不再二值化阈值）：
 * - `wantsFiction`：1 = 要虚构，0.5 = 不限，0 = 要非虚构（来自 choice 三选一）
 * - `wantsRecent`：0 = 不限年代，1 = 只要最近两年的新书（来自 score 档位）
 * - `avoidTheory`：1 = 越通俗越好，0 = 偏好理论（来自 score 档位）
 * - `wantsVerified`：0..1，是否看重口碑（来自 noul）
 */
export interface QueryFacets {
  wantsFiction: number;
  wantsRecent: number;
  avoidTheory: number;
  wantsVerified: number;
}

/** 硬条件的来源，用于回答「凭什么把这本书过滤掉了」 */
export type ConstraintSource = 'rule' | 'model' | 'api';

export interface AppliedConstraint {
  field: 'pubYearFrom' | 'minRating' | 'excludeFiction';
  value: number | boolean;
  source: ConstraintSource;
}

export interface DroppedConstraint {
  field: 'pubYearFrom' | 'minRating';
  value: number;
  /**
   * soft：模型只当成倾向；negated：句中有否定表达；rule-conflict：规则层已给出同名条件。
   * 被丢弃的模型约束不改结果，但必须可见 —— 否则「为什么没按我说的过滤」无从排查。
   */
  reason: 'soft' | 'negated' | 'rule-conflict';
}

/** 检索计划：确定性前置与模型档位的**最终落地结果**（可见、可解释、可回归） */
export interface QueryPlanTrace {
  /** 降噪 + IDF 截断后真正送去词法 lane 的 term */
  terms: string[];
  applied: AppliedConstraint[];
  dropped: DroppedConstraint[];
}

export interface QueryIntent {
  type: IntentType;
  confidence: number;
  needsWiderRecall: number;
  retrieval: {
    lanes: string[];
    lexicalHits: number;
    denseHits: number;
    fusedCandidates: number;
  };
  facets: QueryFacets;
  /** 本次检索实际生效的硬条件与被丢弃的模型约束 */
  plan: QueryPlanTrace;
}

export interface SearchResultWhy {
  lanes: string[];
  laneScores: Record<string, number>;
  matched: string[];
  /** 原始召回名次，1-based */
  recallRank: number;
  fit: number | null;
  /** 模型判定的档位（0..3，见 lib/jev/questions.ts 的 FIT_LEVELS），档位描述可直接展示给用户 */
  fitLevel: number | null;
  /** 档位描述文本（服务端生成：客户端不引入任何服务端模块） */
  fitLevelLabel: string | null;
  /** 档位答案的置信度：概率集中在一档时高，分散在两级时低 */
  fitConfidence: number | null;
  matchPct: number;
  rankScore: number;
  /**
   * 本批 `choice(best)` 里 `__none__` 的概率（精排未跑时为 null）。
   * **不参与门控**：它是 K+1 选一的互斥分布，与逐本独立的 `fit` 不同源，
   * 只用于回答「这次为什么被判成没有相关」。
   */
  pNone: number | null;
}

export interface SearchResultItem {
  book: Book;
  sourceId: string;
  /** 显示值与排序键同源（fit 量化到 1%） */
  relevancePct: number;
  /** choice(best) 的概率 */
  matchPct: number;
  /** 本地相对分（softmax 后） */
  rankScore: number;
  fit: number | null;
  /** false 表示召回已完成但语义排序不可用（rerank 失败），结果沉底但仍返回 */
  ranked: boolean;
  /**
   * 是否**上了首屏**：通过 `fit` 门，且主题型的批级否决没有生效。
   * `results` 恒为 true；`more[]` 中可能为 false，UI 据此标注「未列入推荐」（§6.5）。
   *
   * ⚠️ `passedGate === false` 有**两种**成因，看 `fit` 才能分开：`fit < fitGate`（真的不够格）与
   * `fit >= fitGate` 但被批级否决压下来（此时 `abstainReason === 'batch'`）。
   */
  passedGate: boolean;
  deepLink: string;
  lanes: string[];
  laneScores: Record<string, number>;
  why: SearchResultWhy;
  alsoIn?: string[];
}

/**
 * 本次检索**实际生效**的调参值（默认值 ∪ 环境变量覆盖）。
 * 不可覆盖的项（档位中点、预算上限）也一并带上，保证「这份结果由哪套参数产生」可完整复查。
 */
export interface EffectiveTuning {
  /** 门控位置，单位 = rerank 档位 */
  fitGatePosition: number;
  /** 归一化门控值 = fitGatePosition / (档数 - 1) */
  fitGate: number;
  minResults: number;
  wFit: number;
  wFacet: number;
  facetWeights: { fiction: number; recent: number; theory: number; verified: number };
  /** 不可覆盖：偏好量的语义中点，等于它时贡献为 0 */
  preferenceNeutral: number;
  /** 不可覆盖：facets 合计预算 */
  facetBonusBudget: number;
  recencyFullYears: number;
  recencyDecayYears: number;
  rrfK: number;
  bm25: { k1: number; b: number };
  unseenTermIdf: number;
  defaultMaxTerms: number;
  deepTopKSlack: number;
  widerRecallTrigger: number;
  jevHardStrictness: number;
  jevNegationMax: number;
}

/** 被环境变量改写并生效的项 */
export interface TuningOverride {
  /** 环境变量名 */
  env: string;
  /** 生效字段路径 */
  field: string;
  value: number;
}

/** 被拒绝的环境变量覆盖：**绝不静默使用**，原因随响应返回 */
export interface TuningRejection {
  env: string;
  raw: string;
  reason: string;
}

/** 调参快照：默认值来自 tuning.ts，可被白名单环境变量临时覆盖（无需重新部署） */
export interface TuningSnapshot {
  effective: EffectiveTuning;
  overridden: TuningOverride[];
  rejected: TuningRejection[];
}

export interface SearchTiming {
  lexicalMs: number;
  denseMs: number;
  denseCacheHit: boolean;
  understandMs: number;
  wideMs: number;
  rerankMs: number;
  rankMs: number;
  totalMs: number;
}

export interface JudgeMeta {
  requestedModel: string;
  returnedModel: string | null;
  attempts: number;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

/**
 * 弃权成因 —— `abstained` 不是无因的布尔，每种成因对应的下一步动作不同：
 * - `hard-filter`：候选被硬条件（年份/评分/虚构）全部筛掉 —— 放宽筛选条件；
 * - `fit`：没有任何候选够到 `fit` 门 —— 换个说法描述想要的**主题**；
 * - `batch`：有候选够格，但主题型整体判定认为这批没有真正契合的 —— 可展开低相关度结果。
 */
export type AbstainReason = 'hard-filter' | 'fit' | 'batch';

export interface SemanticSearchResponse {
  query: string;
  mode: SearchMode;
  basedOn: 'exact' | 'retrieval';
  intent: QueryIntent;
  /** 首屏主列表：通过门控的候选，取前 limit 条 */
  results: SearchResultItem[];
  /**
   * 「加载更多」来源：**本次全部已判分候选里首屏没展示的**（通过门控但超出 `limit` 的溢出项 + 未上首屏的其余项），
   * 按 relevancePct 降序。客户端分页揭示，不触发任何新请求（§6.5）。
   *
   * 不变式（有语义排序的路径，即 `ranked === true`）：`results ∪ more` 恰好等于本次已判分的
   * 全部候选，不重不漏 —— 门控只决定**首屏**放什么，绝不静默丢弃任何已判分候选。
   * （`rerank` 整批失败时走降级路径：`ranked === false`、`results` 是召回序的前 `limit` 条、`more` 为空。）
   */
  more: SearchResultItem[];
  /** 首屏是否为空：`abstained ⟺ results.length === 0`。只描述首屏，**不**表示「馆藏里没有相关的书」 */
  abstained: boolean;
  /** 弃权成因；`abstained === false` 时为 null。与 `abstained` 同时成立，用于回答「这次为什么没有首屏结果」 */
  abstainReason: AbstainReason | null;
  /** 可见的降级记录，绝不静默伪装成正常结果 */
  degraded: string[];
  /** 本次生效的调参值与环境变量覆盖记录（「线上为什么和本地不一样」的直接答案） */
  tuning: TuningSnapshot;
  timing: SearchTiming;
  judge: JudgeMeta;
}
