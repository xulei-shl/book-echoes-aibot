import { systemOne } from '@/lib/jev/client';
import { JevDisabledError } from '@/lib/jev/errors';
import {
  FIT_LEVELS,
  RATING_FLOOR_VALUES,
  RECENCY_LEVELS,
  STYLE_LEVELS,
  WIDER_RECALL_LEVELS,
  YEAR_FLOOR_VALUES,
  buildRerankRequest,
  buildUnderstandRequest,
  buildWideRequest,
  fitsKey,
  nearestLevelLabel,
  nearestLevelValue,
  normalizeLevel
} from '@/lib/jev/questions';
import type { SystemOneRequest, SystemOneResult } from '@/lib/jev/types';
import { getLogger } from '@/src/utils/logger';
import { buildIndex, termIdf } from './bm25';
import {
  JUDGE_CACHE_TTL_MS,
  LIMIT_DEFAULT,
  LIMIT_MAX,
  RERANK_BATCH,
  RERANK_TOP_K,
  forceFastAbove,
  jevBudgetPerMinute,
  maxShards,
  readEmbeddingConfig,
  readJevConfig,
  wideShardSize
} from './config';
import {
  FALLBACK_LONG_QUERY_CHARS,
  FALLBACK_WIDER_RECALL_LONG,
  FALLBACK_WIDER_RECALL_SHORT,
  getTuning
} from './tuning';
import { getSearchCorpus } from './corpus';
import { DenseIndexMismatch, loadVectors, type EncodedQuery, type VectorIndex } from './dense';
import { createDenseLane, createLexicalLane } from './lanes';
import { NONE_KEY } from './options';
import { normalizeQuery, explicitToFilters } from './query';
import { eligibility, facetBonusFor, type RerankCandidate, type ScoredCandidate } from './rank';
import { fuseAndFilter, recallLanes } from './recall';
import { normalizeText } from './tokenize';
import type {
  AppliedConstraint,
  DroppedConstraint,
  IntentType,
  JudgeMeta,
  QueryFacets,
  QueryIntent,
  QueryPlanTrace,
  RecallLane,
  RecallResult,
  SearchDoc,
  SearchFilters,
  SearchInput,
  SearchMode,
  SearchResultItem,
  SearchTiming,
  SemanticSearchResponse
} from './types';

const logger = getLogger('search.pipeline');

export type JudgeFn = (request: SystemOneRequest, signal?: AbortSignal) => Promise<SystemOneResult>;

export interface PipelineDeps {
  judge?: JudgeFn;
  /** 注入查询编码（测试用）；默认走远程 embed */
  encode?: (raw: string) => Promise<EncodedQuery>;
  /** 注入语料（测试用）；默认读 public/content */
  corpus?: SearchDoc[];
  /** 注入向量索引；null 表示稠密 lane 不可用 */
  vectors?: VectorIndex | null;
  model?: string;
  now?: () => Date;
}

const NEUTRAL_FACETS: QueryFacets = {
  wantsFiction: 0.5,
  wantsRecent: 0.5,
  avoidTheory: 0.5,
  wantsVerified: 0.5
};

// 索引按语料数组身份缓存（getSearchCorpus() 返回模块级稳定数组）
const indexCache = new WeakMap<SearchDoc[], ReturnType<typeof buildIndex>>();

function indexFor(corpus: SearchDoc[]) {
  let index = indexCache.get(corpus);
  if (!index) {
    index = buildIndex(corpus);
    indexCache.set(corpus, index);
  }
  return index;
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

const deepLinkFor = (doc: SearchDoc): string =>
  `/${encodeURIComponent(doc.sourceId)}?focus=${encodeURIComponent(doc.id)}`;

// ── 进程级 Jev 预算（§9-R11）：超限即降级，避免高峰期被 429 打穿 ─────────────
const budgetTimestamps: number[] = [];

const budget = {
  tryConsume(count: number): boolean {
    const now = Date.now();
    while (budgetTimestamps.length > 0 && now - budgetTimestamps[0] > 60_000) {
      budgetTimestamps.shift();
    }
    if (budgetTimestamps.length + count > jevBudgetPerMinute()) return false;
    for (let i = 0; i < count; i += 1) budgetTimestamps.push(now);
    return true;
  }
};

// ── 简易 TTL 缓存（§7.2）────────────────────────────────────────────────────
const judgeCache = new Map<string, { expiresAt: number; value: unknown }>();

function cacheGet<T>(key: string): T | undefined {
  const entry = judgeCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    judgeCache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function cacheSet(key: string, value: unknown): void {
  judgeCache.set(key, { expiresAt: Date.now() + JUDGE_CACHE_TTL_MS, value });
}

/** 测试用：清空预算窗口与缓存。 */
export function resetPipelineState(): void {
  budgetTimestamps.length = 0;
  judgeCache.clear();
}

// ── 阶段 ①：意图与口味 ───────────────────────────────────────────────────────
interface Understanding {
  type: IntentType;
  confidence: number;
  needsWiderRecall: number;
  facets: QueryFacets;
  /** 模型档位推出的年份/评分条件（尚未决定是否升级成硬过滤） */
  modelConstraints: SearchFilters;
  /** `constraint_strictness`：模型认为这些条件是硬条件的概率 */
  strictness: number;
  /** `negation_present`：句中有否定/排除表达的概率 */
  negation: number;
}

async function understand(
  query: string,
  corpusSize: number,
  judge: JudgeFn,
  model: string,
  signal?: AbortSignal
): Promise<{ value: Understanding; failed: boolean; ms: number }> {
  const started = Date.now();
  try {
    const result = await judge(buildUnderstandRequest(query, corpusSize, model), signal);
    const intentAnswer = result.answers.intent;
    const noul = (key: string, fallback: number): number => {
      const answer = result.answers[key];
      return answer && answer.type === 'noul' ? answer.noul : fallback;
    };
    /** 档位题 → [0,1] 连续偏好（档位数由问题表决定，跨题可比） */
    const levelPreference = (key: string, levels: readonly unknown[], fallback: number): number => {
      const answer = result.answers[key];
      return answer && answer.type === 'score' ? normalizeLevel(answer.score, levels.length) : fallback;
    };
    /** 档位题 → 离散档位取值（如年份/评分下限表格） */
    const levelBucket = (key: string, values: readonly number[]): number => {
      const answer = result.answers[key];
      return answer && answer.type === 'score' ? nearestLevelValue(answer.score, values) : 0;
    };

    const genre = result.answers.genre_preference;
    const wantsFiction =
      genre && genre.type === 'choice'
        ? genre.choice === 'fiction'
          ? 1
          : genre.choice === 'nonfiction'
            ? 0
            : 0.5
        : 0.5;

    const yearFloor = levelBucket('year_floor', YEAR_FLOOR_VALUES);
    const ratingFloor = levelBucket('rating_floor', RATING_FLOOR_VALUES);

    return {
      value: {
        type:
          intentAnswer && intentAnswer.type === 'choice'
            ? (intentAnswer.choice as IntentType)
            : 'other',
        confidence: intentAnswer && intentAnswer.type === 'choice' ? intentAnswer.confidence : 0,
        needsWiderRecall: levelPreference('needs_wider_recall', WIDER_RECALL_LEVELS, 0),
        facets: {
          wantsFiction,
          wantsRecent: levelPreference('recency_preference', RECENCY_LEVELS, 0.5),
          // 风格档位越高越偏理论，而 facet 的语义是「越通俗越好」，所以取反
          avoidTheory: 1 - levelPreference('style_preference', STYLE_LEVELS, 0.5),
          wantsVerified: noul('wants_verified', 0.5)
        },
        modelConstraints: {
          ...(yearFloor > 0 ? { pubYearFrom: yearFloor } : {}),
          ...(ratingFloor > 0 ? { minRating: ratingFloor } : {})
        },
        strictness: noul('constraint_strictness', 0),
        negation: noul('negation_present', 0)
      },
      failed: false,
      ms: Date.now() - started
    };
  } catch (error) {
    logger.error('understandQuery 失败，召回照常进行', {
      message: error instanceof Error ? error.message : String(error)
    });
    return {
      value: {
        type: 'other',
        confidence: 0,
        // 启发式：长句更可能需要语义宽召回（阈值见 tuning.ts）
        needsWiderRecall:
          query.length >= FALLBACK_LONG_QUERY_CHARS
            ? FALLBACK_WIDER_RECALL_LONG
            : FALLBACK_WIDER_RECALL_SHORT,
        facets: { ...NEUTRAL_FACETS },
        // 模型不可用时不猜任何硬条件
        modelConstraints: {},
        strictness: 0,
        negation: 0
      },
      failed: true,
      ms: Date.now() - started
    };
  }
}

// ── 阶段 ②：wide 全库分片（仅 deep）────────────────────────────────────────
async function runWide(
  query: string,
  corpus: SearchDoc[],
  judge: JudgeFn,
  model: string,
  degraded: string[],
  signal?: AbortSignal
): Promise<{ results: RecallResult[]; ms: number }> {
  const started = Date.now();
  if (corpus.length > forceFastAbove()) {
    degraded.push('wide-skipped');
    return { results: [], ms: 0 };
  }
  const shards = chunk(corpus, wideShardSize());
  if (shards.length > maxShards()) {
    degraded.push('wide-limit');
    return { results: [], ms: 0 };
  }
  if (!budget.tryConsume(shards.length)) {
    degraded.push('wide-budget');
    return { results: [], ms: 0 };
  }

  const settled = await Promise.allSettled(
    shards.map(shard => {
      const { request } = buildWideRequest(query, shard, model);
      return judge(request, signal).then(result => ({ result, shard }));
    })
  );

  const results: RecallResult[] = [];
  let failed = 0;
  for (const entry of settled) {
    if (entry.status === 'rejected') {
      failed += 1;
      continue;
    }
    const { result, shard } = entry.value;
    const answer = result.answers.pick;
    if (!answer || answer.type !== 'choice') {
      failed += 1;
      continue;
    }
    // pick = __none__ 胜出的片整片丢弃
    if (answer.choice === NONE_KEY) continue;
    // 片内取 top-5（按片内概率）；片级 `shard_fit` 档位分才是**跨片可比**的信号
    const fitAnswer = result.answers.shard_fit;
    const shardFit =
      fitAnswer && fitAnswer.type === 'score'
        ? normalizeLevel(fitAnswer.score, FIT_LEVELS.length)
        : null;
    shard
      .map((doc, index) => ({ doc, probability: answer.probabilities[`b${index}`] ?? 0 }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 5)
      .forEach(item => {
        // 档位题缺失时退回片内概率（跨片不可比，但至少不丢这批候选）
        const score = shardFit ?? item.probability;
        results.push({
          docId: item.doc.id,
          score,
          lanes: ['wide'],
          matched: [],
          laneScores: { wide: score }
        });
      });
  }

  if (failed > 0) degraded.push(`wide:${failed}`);
  // 跨片按贴合度排序：此前按分片顺序拼接，RRF 名次实际由分片下标决定
  results.sort((a, b) => b.score - a.score || a.docId.localeCompare(b.docId));
  return { results, ms: Date.now() - started };
}

// ── 阶段 ③：rerank ─────────────────────────────────────────────────────────
interface RerankOutcome {
  ok: boolean;
  pNone: number;
  batchHasMatch: boolean | null;
  bestProbability: number[];
  /** 归一化适配度 = score / (档数-1) ∈ [0,1]，缺失记 null */
  fits: (number | null)[];
  /** 原始档位（0..3），供 UI 直接展示「按哪一档判的」 */
  fitLevels: (number | null)[];
  /** 档位答案的置信度 */
  fitConfidences: (number | null)[];
}

async function runRerank(
  query: string,
  candidates: SearchDoc[],
  judge: JudgeFn,
  model: string,
  degraded: string[],
  signal?: AbortSignal
): Promise<RerankOutcome> {
  const bestProbability = new Array<number>(candidates.length).fill(0);
  const fits = new Array<number | null>(candidates.length).fill(null);
  const fitLevels = new Array<number | null>(candidates.length).fill(null);
  const fitConfidences = new Array<number | null>(candidates.length).fill(null);
  if (candidates.length === 0) {
    return {
      ok: false,
      pNone: 0,
      batchHasMatch: null,
      bestProbability,
      fits,
      fitLevels,
      fitConfidences
    };
  }

  const batches = chunk(candidates, RERANK_BATCH);
  if (!budget.tryConsume(batches.length)) {
    degraded.push('rerank-budget');
    return {
      ok: false,
      pNone: 0,
      batchHasMatch: null,
      bestProbability,
      fits,
      fitLevels,
      fitConfidences
    };
  }

  const settled = await Promise.allSettled(
    batches.map(batch => judge(buildRerankRequest(query, batch, model).request, signal))
  );

  let pNone = 0;
  let succeeded = 0;
  let failed = 0;
  const batchHasMatchValues: boolean[] = [];

  settled.forEach((entry, batchIndex) => {
    const offset = batchIndex * RERANK_BATCH;
    const batch = batches[batchIndex];
    if (entry.status === 'rejected') {
      failed += 1;
      return;
    }
    succeeded += 1;
    const answers = entry.value.answers;
    const best = answers.best;
    if (best && best.type === 'choice') {
      pNone = Math.max(pNone, best.probabilities[NONE_KEY] ?? 0);
      batch.forEach((_, index) => {
        bestProbability[offset + index] = best.probabilities[`b${index}`] ?? 0;
      });
    }
    batch.forEach((_, index) => {
      const answer = answers[fitsKey(index)];
      if (answer && answer.type === 'score') {
        fits[offset + index] = normalizeLevel(answer.score, FIT_LEVELS.length);
        fitLevels[offset + index] = Math.round(answer.score);
        fitConfidences[offset + index] = answer.confidence;
      }
    });
    const batchHasMatch = answers.batch_has_match;
    if (batchHasMatch && batchHasMatch.type === 'noul') {
      batchHasMatchValues.push(batchHasMatch.noul > 0.5);
    }
  });

  if (failed > 0) degraded.push(`rerank:${failed}`);
  return {
    ok: succeeded > 0,
    pNone,
    batchHasMatch: batchHasMatchValues.length === 0 ? null : batchHasMatchValues.some(Boolean),
    bestProbability,
    fits,
    fitLevels,
    fitConfidences
  };
}

// ── 结果组装 ────────────────────────────────────────────────────────────────
function toResultItem(candidate: ScoredCandidate, passedGate = true): SearchResultItem {
  return {
    book: candidate.doc.book,
    sourceId: candidate.doc.sourceId,
    relevancePct: candidate.relevancePct,
    matchPct: candidate.matchPct,
    rankScore: candidate.rankScore,
    fit: candidate.fit,
    ranked: true,
    passedGate,
    deepLink: deepLinkFor(candidate.doc),
    lanes: candidate.lanes,
    laneScores: candidate.laneScores,
    why: {
      lanes: candidate.lanes,
      laneScores: candidate.laneScores,
      matched: candidate.matched,
      recallRank: candidate.recallRank,
      fit: candidate.fit,
      fitLevel: candidate.fitLevel,
      fitLevelLabel:
        candidate.fitLevel === null ? null : nearestLevelLabel(candidate.fitLevel, FIT_LEVELS),
      fitConfidence: candidate.fitConfidence,
      matchPct: candidate.matchPct,
      rankScore: candidate.rankScore
    },
    ...(candidate.doc.alsoIn ? { alsoIn: candidate.doc.alsoIn } : {})
  };
}

/** rerank 不可用时的兜底结果：全部保留、ranked=false 沉底。 */
function unrankedFromRecall(
  results: RecallResult[],
  docs: Map<string, SearchDoc>,
  limit: number
): SearchResultItem[] {
  const items: SearchResultItem[] = [];
  for (const result of results) {
    if (items.length >= limit) break;
    const doc = docs.get(result.docId);
    if (!doc) continue;
    items.push({
      book: doc.book,
      sourceId: doc.sourceId,
      relevancePct: 0,
      matchPct: 0,
      rankScore: 0,
      fit: null,
      ranked: false,
      passedGate: true,
      deepLink: deepLinkFor(doc),
      lanes: result.lanes,
      laneScores: result.laneScores,
      why: {
        lanes: result.lanes,
        laneScores: result.laneScores,
        matched: result.matched,
        recallRank: 0,
        fit: null,
        fitLevel: null,
        fitLevelLabel: null,
        fitConfidence: null,
        matchPct: 0,
        rankScore: 0
      },
      ...(doc.alsoIn ? { alsoIn: doc.alsoIn } : {})
    });
  }
  return items;
}

const neutralFacets = (): QueryFacets => ({ ...NEUTRAL_FACETS });

function findExactMatch(corpus: SearchDoc[], raw: string): SearchDoc | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const needle = normalizeText(trimmed).trim();
  for (const doc of corpus) {
    if (doc.id === trimmed) return doc;
    if (doc.exact.isbn && doc.exact.isbn === trimmed) return doc;
    if (doc.exact.callNumber && normalizeText(doc.exact.callNumber).trim() === needle) return doc;
    if (needle.length >= 2 && normalizeText(doc.book.title).trim() === needle) return doc;
  }
  return null;
}

/**
 * 硬条件的最终裁决（三层：规则 → 模型档位 → 请求级 filters）。
 *
 * **规则层（用户原句的字面条件）永远生效**；模型档位只有在三件事同时成立时才升级成硬过滤：
 * 1. 句中没有否定表达（`negation` ≤ `negationMax`）—— 「不要 2015 年以后」不能被反过来执行；
 * 2. 模型认为它是硬条件（`strictness` ≥ `hardStrictness`）；
 * 3. 规则层没有给出同名条件（字面证据优先，避免两套标准）。
 *
 * 不满足时进入 `plan.dropped`：模型可以提出条件，但不能单方面删结果（延续 facets「只能微调」的纪律）。
 * 请求级 `filters` 是调用方显式声明的，同名下限取更大者。
 */
function resolveConstraints(args: {
  rule: SearchFilters;
  model: SearchFilters;
  strictness: number;
  negation: number;
  /** 生效门槛（默认来自 tuning.ts，可被环境变量覆盖） */
  hardStrictness: number;
  negationMax: number;
  requested: SearchFilters | undefined;
  terms: string[];
}): { filters: SearchFilters; plan: QueryPlanTrace } {
  const filters: SearchFilters = {};
  const applied: AppliedConstraint[] = [];
  const dropped: DroppedConstraint[] = [];

  // ① 规则层：字面条件，永远生效
  if (args.rule.minRating !== undefined) {
    filters.minRating = args.rule.minRating;
    applied.push({ field: 'minRating', value: args.rule.minRating, source: 'rule' });
  }
  if (args.rule.pubYearFrom !== undefined) {
    filters.pubYearFrom = args.rule.pubYearFrom;
    applied.push({ field: 'pubYearFrom', value: args.rule.pubYearFrom, source: 'rule' });
  }
  if (args.rule.excludeFiction) {
    filters.excludeFiction = true;
    applied.push({ field: 'excludeFiction', value: true, source: 'rule' });
  }

  // ② 模型档位：需要过否定 / 严格性 / 不与规则冲突三道门
  const negated = args.negation > args.negationMax;
  const strict = args.strictness >= args.hardStrictness;
  const considerModel = (field: 'pubYearFrom' | 'minRating', value: number | undefined): void => {
    if (value === undefined) return;
    if (filters[field] !== undefined) {
      dropped.push({ field, value, reason: 'rule-conflict' });
      return;
    }
    if (negated) {
      dropped.push({ field, value, reason: 'negated' });
      return;
    }
    if (!strict) {
      dropped.push({ field, value, reason: 'soft' });
      return;
    }
    filters[field] = value;
    applied.push({ field, value, source: 'model' });
  };
  considerModel('pubYearFrom', args.model.pubYearFrom);
  considerModel('minRating', args.model.minRating);

  // ③ 请求级 filters：显式传参，下限取更强约束
  const requested = args.requested;
  if (requested) {
    const claim = (field: 'pubYearFrom' | 'minRating', value: number): void => {
      const current = filters[field];
      if (current === undefined || value > current) {
        filters[field] = value;
        const existing = applied.findIndex(entry => entry.field === field);
        const entry: AppliedConstraint = { field, value, source: 'api' };
        if (existing >= 0) applied[existing] = entry;
        else applied.push(entry);
      }
    };
    if (requested.minRating !== undefined) claim('minRating', requested.minRating);
    if (requested.pubYearFrom !== undefined) claim('pubYearFrom', requested.pubYearFrom);
    if (requested.excludeFiction) {
      filters.excludeFiction = true;
      if (!applied.some(entry => entry.field === 'excludeFiction')) {
        applied.push({ field: 'excludeFiction', value: true, source: 'api' });
      }
    }
  }

  return { filters, plan: { terms: args.terms, applied, dropped } };
}

/**
 * 检索主链路：确定性前置 → 意图/召回并发 → wide（deep）→ RRF → 精排 → 门控 → 排序。
 * 模型失败 = 降级而非中断，且降级必须可见（degraded[]）。
 */
export async function runSemanticSearch(
  input: SearchInput,
  deps: PipelineDeps = {},
  signal?: AbortSignal
): Promise<SemanticSearchResponse> {
  const startedAt = Date.now();
  const now = deps.now ? deps.now() : new Date();
  const mode: SearchMode = input.mode ?? 'fast';
  const limit = Math.max(1, Math.min(LIMIT_MAX, input.limit ?? LIMIT_DEFAULT));
  const degraded: string[] = [];
  // 本次请求的生效调参（默认值 ∪ 白名单环境变量覆盖），全链路只用这一份，
  // 并原样回传在响应里 —— 「线上为什么和本地不一样」不再靠猜。
  const tuning = getTuning();

  const judge: JudgeFn =
    deps.judge ?? ((request, innerSignal) => systemOne(request, { signal: innerSignal }));
  const config = readJevConfig();
  if (!deps.judge && !config) {
    throw new JevDisabledError();
  }
  const model = deps.model ?? config?.model ?? 'jev-latest';

  const judgeMeta: JudgeMeta = {
    requestedModel: model,
    returnedModel: null,
    attempts: 0,
    usage: { inputTokens: null, outputTokens: null }
  };
  const recordJudge = (result: SystemOneResult) => {
    judgeMeta.returnedModel = judgeMeta.returnedModel ?? result.model;
    judgeMeta.attempts += result.attempts;
    if (result.usage.input_tokens !== null) {
      judgeMeta.usage.inputTokens = (judgeMeta.usage.inputTokens ?? 0) + result.usage.input_tokens;
    }
    if (result.usage.output_tokens !== null) {
      judgeMeta.usage.outputTokens = (judgeMeta.usage.outputTokens ?? 0) + result.usage.output_tokens;
    }
  };
  const trackedJudge: JudgeFn = async (request, innerSignal) => {
    const result = await judge(request, innerSignal);
    recordJudge(result);
    return result;
  };

  const corpus = deps.corpus ?? (await getSearchCorpus());
  const docs = new Map(corpus.map(doc => [doc.id, doc]));
  const index = indexFor(corpus);
  const normalized = normalizeQuery(input.query, {
    idf: term => termIdf(index, term, tuning.effective.unseenTermIdf),
    now
  });

  const timing: SearchTiming = {
    lexicalMs: 0,
    denseMs: 0,
    denseCacheHit: false,
    understandMs: 0,
    wideMs: 0,
    rerankMs: 0,
    rankMs: 0,
    totalMs: 0
  };
  const finalize = (
    response: Omit<SemanticSearchResponse, 'timing' | 'tuning'>
  ): SemanticSearchResponse => ({
    ...response,
    tuning,
    timing: { ...timing, totalMs: Date.now() - startedAt }
  });

  // ── 0. 确定性前置：精确命中直接返回，0 次 Jev ─────────────────────────────
  const exact = findExactMatch(corpus, normalized.raw);
  if (exact) {
    const item: SearchResultItem = {
      book: exact.book,
      sourceId: exact.sourceId,
      relevancePct: 100,
      matchPct: 100,
      rankScore: 1,
      fit: null,
      ranked: true,
      passedGate: true,
      deepLink: deepLinkFor(exact),
      lanes: ['exact'],
      laneScores: {},
      why: {
        lanes: ['exact'],
        laneScores: {},
        matched: [],
        recallRank: 1,
        fit: null,
        fitLevel: null,
        fitLevelLabel: null,
        fitConfidence: null,
        matchPct: 100,
        rankScore: 1
      },
      ...(exact.alsoIn ? { alsoIn: exact.alsoIn } : {})
    };
    return finalize({
      query: normalized.raw,
      mode,
      basedOn: 'exact',
      intent: {
        type: 'work',
        confidence: 1,
        needsWiderRecall: 0,
        retrieval: { lanes: ['exact'], lexicalHits: 0, denseHits: 0, fusedCandidates: 1 },
        facets: neutralFacets(),
        plan: { terms: normalized.terms, applied: [], dropped: [] }
      },
      results: [item],
      more: [],
      abstained: false,
      degraded,
      judge: judgeMeta
    });
  }

  // ── 向量索引（构建期产物；缺失/不一致即降级为纯词法，绝不静默算错余弦）────
  let vectors: VectorIndex | null;
  if (deps.vectors !== undefined) {
    vectors = deps.vectors;
  } else if (!readEmbeddingConfig()) {
    // 未配置 key：不重试、不报错，直接标记不可用
    vectors = null;
    degraded.push('dense-unavailable');
  } else {
    try {
      vectors = await loadVectors();
    } catch (error) {
      vectors = null;
      degraded.push(error instanceof DenseIndexMismatch ? 'dense-mismatch' : 'dense-unavailable');
    }
  }
  if (vectors === null && !degraded.includes('dense-unavailable') && !degraded.includes('dense-mismatch')) {
    degraded.push('dense-unavailable');
  }

  const lexicalLane = createLexicalLane(index);
  const timedLexical: RecallLane = {
    id: 'lexical',
    async search(ctx) {
      const t = Date.now();
      const results = await lexicalLane.search(ctx);
      timing.lexicalMs = Date.now() - t;
      return results;
    }
  };
  const denseLane = createDenseLane({
    index: vectors,
    ...(deps.encode ? { encode: deps.encode } : {}),
    onDegraded: code => {
      if (!degraded.includes(code)) degraded.push(code);
    },
    onTiming: (ms, cacheHit) => {
      timing.denseMs = ms;
      timing.denseCacheHit = cacheHit;
    }
  });

  // ── ① + 2A/2B 投机并发：意图理解与两条召回同时发出，绝不串行等待 ──────────
  // 缓存键用**原句**（归一化后）而非降噪产物 `core`：降噪是有损的，
  // 而现在意图里还带着模型档位推出的硬条件，用有损键会让两条不同问题共用一份约束。
  // 版本号 v2：题型从 noul 换成 score/choice，旧缓存不可复用。
  const understandKey = `v2|${mode}|${normalizeText(normalized.raw)}`;
  const cachedUnderstanding = cacheGet<Understanding>(understandKey);
  const understandPromise = cachedUnderstanding
    ? Promise.resolve({ value: cachedUnderstanding, failed: false, ms: 0 })
    : understand(normalized.raw, corpus.length, trackedJudge, model, signal).then(outcome => {
        if (!outcome.failed) cacheSet(understandKey, outcome.value);
        return outcome;
      });

  const deepTopK =
    mode === 'deep' ? RERANK_TOP_K + tuning.effective.deepTopKSlack : RERANK_TOP_K;
  const lanesPromise = recallLanes(
    { raw: normalized.raw, core: normalized.terms },
    [timedLexical, denseLane]
  );

  const [understanding, laneResults] = await Promise.all([understandPromise, lanesPromise]);
  timing.understandMs = understanding.ms;
  if (understanding.failed) degraded.push('understand');

  // ── 2C wide（仅 deep，且 needs_wider_recall 高置信）：作为第三条 lane 并入 RRF ─
  let allLaneResults = laneResults;
  if (mode === 'deep' && understanding.value.needsWiderRecall > tuning.effective.widerRecallTrigger) {
    const wide = await runWide(normalized.raw, corpus, trackedJudge, model, degraded, signal);
    timing.wideMs = wide.ms;
    if (wide.results.length > 0) {
      allLaneResults = [...laneResults, wide.results];
    }
  }

  const constraints = resolveConstraints({
    rule: explicitToFilters(normalized.explicit),
    model: understanding.value.modelConstraints,
    strictness: understanding.value.strictness,
    negation: understanding.value.negation,
    hardStrictness: tuning.effective.jevHardStrictness,
    negationMax: tuning.effective.jevNegationMax,
    requested: input.filters,
    terms: normalized.terms
  });
  // 被丢弃的模型约束不标 degraded（不是降级，是可解释的策略结果），看 intent.plan.dropped
  const fused = fuseAndFilter(allLaneResults, docs, constraints.filters, deepTopK);
  const lexicalHits = fused.filter(result => result.lanes.includes('lexical')).length;
  const denseHits = fused.filter(result => result.lanes.includes('dense')).length;

  // 硬条件把候选全部滤掉：这是用户的确定性约束，直接诚实弃权，
  // 不烧一次 Jev 精排，也不能误标成 'rerank' 降级。
  if (fused.length === 0 && constraints.plan.applied.length > 0) {
    return finalize({
      query: normalized.raw,
      mode,
      basedOn: 'retrieval',
      intent: {
        type: understanding.value.type,
        confidence: understanding.value.confidence,
        needsWiderRecall: understanding.value.needsWiderRecall,
        retrieval: {
          lanes: [...new Set(allLaneResults.flatMap(lane => lane.map(result => result.lanes)).flat())],
          lexicalHits: 0,
          denseHits: 0,
          fusedCandidates: 0
        },
        facets: understanding.value.facets,
        plan: constraints.plan
      },
      results: [],
      more: [],
      abstained: true,
      degraded,
      judge: judgeMeta
    });
  }

  const topK = fused.slice(0, RERANK_TOP_K);
  const candidates: SearchDoc[] = [];
  topK.forEach(result => {
    const doc = docs.get(result.docId);
    if (doc && !candidates.includes(doc)) candidates.push(doc);
  });

  // ── ③ rerank ─────────────────────────────────────────────────────────────
  const rerankStarted = Date.now();
  const rerankOutcome = await runRerank(
    normalized.raw,
    candidates,
    trackedJudge,
    model,
    degraded,
    signal
  );
  timing.rerankMs = Date.now() - rerankStarted;

  const intent: QueryIntent = {
    type: understanding.value.type,
    confidence: understanding.value.confidence,
    needsWiderRecall: understanding.value.needsWiderRecall,
    retrieval: {
      lanes: [...new Set(allLaneResults.flatMap(lane => lane.map(result => result.lanes)).flat())],
      lexicalHits,
      denseHits,
      fusedCandidates: topK.length
    },
    facets: understanding.value.facets,
    plan: constraints.plan
  };

  // rerank 整批失败：结果全部保留、ranked=false 沉底，绝不返回「0 结果」
  if (!rerankOutcome.ok) {
    if (!degraded.includes('rerank')) degraded.push('rerank');
    return finalize({
      query: normalized.raw,
      mode,
      basedOn: 'retrieval',
      intent,
      results: unrankedFromRecall(fused, docs, limit),
      more: [],
      abstained: false,
      degraded,
      judge: judgeMeta
    });
  }

  // ── ④ 门控 + 排序 + 量化 ──────────────────────────────────────────────────
  const rankStarted = Date.now();
  const rerankCandidates: RerankCandidate[] = [];
  topK.forEach((result, index) => {
    const doc = docs.get(result.docId);
    if (!doc) return;
    rerankCandidates.push({
      doc,
      bestProbability: rerankOutcome.bestProbability[index] ?? 0,
      fit: rerankOutcome.fits[index] ?? null,
      fitLevel: rerankOutcome.fitLevels[index] ?? null,
      fitConfidence: rerankOutcome.fitConfidences[index] ?? null,
      recallRank: index + 1,
      lanes: result.lanes,
      laneScores: result.laneScores,
      matched: result.matched,
      facetBonus: facetBonusFor(
        doc,
        understanding.value.facets,
        now.getFullYear(),
        tuning.effective
      )
    });
  });

  const outcome = eligibility(
    rerankCandidates,
    {
      pNone: rerankOutcome.pNone,
      batchHasMatch: rerankOutcome.batchHasMatch
    },
    tuning.effective
  );
  timing.rankMs = Date.now() - rankStarted;

  // 「加载更多」：本页未展示的已判分候选 = 通过门控的溢出项 + 未通过门控的 rejected，
  // 统一按 relevancePct → matchPct → recallRank 降序；不触发任何新 Jev 请求（§6.5）。
  const more = [
    ...outcome.items.slice(limit).map(candidate => ({ candidate, passedGate: true })),
    ...outcome.rejected.map(candidate => ({ candidate, passedGate: false }))
  ]
    .sort(
      (a, b) =>
        b.candidate.relevancePct - a.candidate.relevancePct ||
        b.candidate.matchPct - a.candidate.matchPct ||
        a.candidate.recallRank - b.candidate.recallRank
    )
    .map(entry => toResultItem(entry.candidate, entry.passedGate));

  return finalize({
    query: normalized.raw,
    mode,
    basedOn: 'retrieval',
    intent,
    results: outcome.items.slice(0, limit).map(item => toResultItem(item)),
    more,
    abstained: outcome.abstained,
    degraded,
    judge: judgeMeta
  });
}
