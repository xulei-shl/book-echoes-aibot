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
   * 是否通过门控（fit ≥ 0.30 且 best.p > p_none）。
   * `results` 恒为 true；`more[]` 中可能为 false（未通过门控），UI 据此标注（§6.5）。
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

export interface SemanticSearchResponse {
  query: string;
  mode: SearchMode;
  basedOn: 'exact' | 'retrieval';
  intent: QueryIntent;
  /** 首屏主列表：通过门控的候选，取前 limit 条 */
  results: SearchResultItem[];
  /**
   * 「加载更多」来源：本页未展示的已判分候选（通过门控的溢出项 + 未通过门控的 rejected），
   * 按 relevancePct 降序。客户端分页揭示，不触发任何新请求（§6.5）。
   */
  more: SearchResultItem[];
  abstained: boolean;
  /** 可见的降级记录，绝不静默伪装成正常结果 */
  degraded: string[];
  /** 本次生效的调参值与环境变量覆盖记录（「线上为什么和本地不一样」的直接答案） */
  tuning: TuningSnapshot;
  timing: SearchTiming;
  judge: JudgeMeta;
}
