import path from 'node:path';

/**
 * 语义检索模块的**结构上限与运行时常量**：截断长度、分片数量、并发/预算上限、TTL。
 * 这些值决定「系统允许多大/多久」，基本不随调参变化 —— 要改它们通常伴随架构或成本决策。
 *
 * 排序权重与判定阈值（fit 门控、BM25 参数、facets 权重、模型约束门槛）在 `tuning.ts`。
 *
 * 环境相关的少数配置用函数读取（而非模块级常量），保证测试可以在导入后覆写 env。
 */

// 质量调参（权重、门槛、档位）统一在 tuning.ts —— 本文件只放「系统允许多大/多久」的结构上限。

// ── 召回规模上限（§4.3 / §5.4.4）──────────────────────────────────────────
/** 每条 lane 各取多少候选 */
export const LANE_LIMIT = 60;
/** 交给 Jev 精排的候选上限（fast） */
export const RERANK_TOP_K = 40;
/** 精排批大小（两个参考项目都用 40） */
export const RERANK_BATCH = 40;

// ── wide 分片（§4.5 / §9-R11）──────────────────────────────────────────────
const DEFAULT_WIDE_SHARD = 50;
const DEFAULT_MAX_SHARDS = 16;
const DEFAULT_FORCE_FAST_ABOVE = 3000;
const DEFAULT_JEV_BUDGET_PER_MIN = 60;

// ── 截断（§6.4）────────────────────────────────────────────────────────────
export const EXCERPT_MAX_CHARS = 600;
export const LABEL_MAX_CHARS = 160;
export const GIST_MAX_CHARS = 160;
export const QUERY_MAX_CHARS = 300;

// ── 缓存 TTL（§7.2）────────────────────────────────────────────────────────
export const CORPUS_TTL_MS = 5 * 60 * 1000;
export const JUDGE_CACHE_TTL_MS = 10 * 60 * 1000;
export const QUERY_VECTOR_CACHE_SIZE = 256;

// ── 默认值与上限 ────────────────────────────────────────────────────────────
export const LIMIT_DEFAULT = 12;
export const LIMIT_MAX = 24;

export const VECTORS_PATH = path.join(process.cwd(), 'public', 'content', 'search_vectors.bin');

const readNumber = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

const readString = (key: string, fallback: string): string => process.env[key] ?? fallback;

export const wideShardSize = (): number => readNumber('SEMANTIC_SEARCH_WIDE_SHARD', DEFAULT_WIDE_SHARD);
export const maxShards = (): number => readNumber('SEMANTIC_SEARCH_MAX_SHARDS', DEFAULT_MAX_SHARDS);
export const forceFastAbove = (): number => readNumber('SEMANTIC_SEARCH_FORCE_FAST_ABOVE', DEFAULT_FORCE_FAST_ABOVE);
export const jevBudgetPerMinute = (): number => readNumber('SEMANTIC_SEARCH_JEV_BUDGET_PER_MIN', DEFAULT_JEV_BUDGET_PER_MIN);

export const isSemanticSearchEnabled = (): boolean => process.env.SEMANTIC_SEARCH_ENABLED === '1';

export const defaultMode = (): 'fast' | 'deep' =>
  process.env.SEMANTIC_SEARCH_DEFAULT_MODE === 'deep' ? 'deep' : 'fast';

export interface JevConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

/** Jev 鉴权与模型配置。缺失 key 时返回 null，由调用方决定报错还是降级。 */
export function readJevConfig(): JevConfig | null {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey || apiKey === 'your_typesafe_api_key') {
    return null;
  }
  return {
    apiKey,
    model: readString('JEV_MODEL', 'jev-latest'),
    timeoutMs: readNumber('JEV_TIMEOUT_MS', 20_000)
  };
}

export interface EmbeddingConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  dim: number;
  timeoutMs: number;
}

/** 稠密 lane 的 embedding provider 配置。缺 key 即 dense lane 不可用（降级，不报错）。 */
export function readEmbeddingConfig(): EmbeddingConfig | null {
  const apiKey = process.env.EMBEDDING_API_KEY;
  if (!apiKey) {
    return null;
  }
  return {
    baseUrl: readString('EMBEDDING_BASE_URL', 'https://api.siliconflow.cn/v1').replace(/\/+$/, ''),
    apiKey,
    model: readString('EMBEDDING_MODEL', 'BAAI/bge-m3'),
    dim: readNumber('EMBEDDING_DIM', 1024),
    timeoutMs: readNumber('EMBEDDING_TIMEOUT_MS', 1500)
  };
}
