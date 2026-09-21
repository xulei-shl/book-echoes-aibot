import type { Book } from '@/types';

/**
 * 检索专用字段集合。分词后按字段加权送入 BM25（见 bm25.ts::FIELD_WEIGHTS）。
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
}

export type SearchMode = 'fast' | 'deep';

export interface SearchInput {
  query: string;
  mode?: SearchMode;
  limit?: number;
  filters?: SearchFilters;
}

export type IntentType = 'concept' | 'work' | 'similar' | 'list' | 'other';

/** 软过滤先验，只参与本地打分（§6.3），不直接删结果 */
export interface QueryFacets {
  wantsFiction: number;
  wantsRecent: number;
  avoidTheory: number;
  wantsVerified: number;
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
}

export interface SearchResultWhy {
  lanes: string[];
  laneScores: Record<string, number>;
  matched: string[];
  /** 原始召回名次，1-based */
  recallRank: number;
  fit: number | null;
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
  deepLink: string;
  lanes: string[];
  laneScores: Record<string, number>;
  why: SearchResultWhy;
  alsoIn?: string[];
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
  results: SearchResultItem[];
  abstained: boolean;
  /** 可见的降级记录，绝不静默伪装成正常结果 */
  degraded: string[];
  timing: SearchTiming;
  judge: JudgeMeta;
}
