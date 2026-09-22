import { systemOne } from '@/lib/jev/client';
import { JevDisabledError } from '@/lib/jev/errors';
import {
  FIT_LEVELS,
  RATING_FLOOR_VALUES,
  RECENCY_LEVELS,
  STYLE_LEVELS,
  WIDER_RECALL_LEVELS,
  YEAR_FLOOR_VALUES,
  CALL_CLASS_L1_KEY,
  CALL_CLASS_L2_KEY,
  buildClassRequest,
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
import { NONE_KEY, classOptionSetsFromCorpus, resolveClassKey } from './options';
import { findClcClass, resolveClcCode } from './clc';
import type { ClassOptionMap, ClassOptionSets } from './options';
import { normalizeQuery, explicitToFilters } from './query';
import {
  eligibility,
  facetBonusFor,
  isFacetQuery,
  type RerankCandidate,
  type ScoredCandidate
} from './rank';
import { buildAllowSet, fuseAndFilter, recallLanes } from './recall';
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

/**
 * 交给模型挑选的中图法类目选项（语料里**确实有书**的那些，分一级与二级/三级两组），
 * 按语料数组身份缓存。同一份语料必须给出同一套 `c0..cN`，否则答案会与选项错位。
 */
const classSetsCache = new WeakMap<SearchDoc[], ClassOptionSets>();

function classOptionSetsFor(corpus: SearchDoc[]): ClassOptionSets {
  let sets = classSetsCache.get(corpus);
  if (!sets) {
    sets = classOptionSetsFromCorpus(corpus);
    classSetsCache.set(corpus, sets);
  }
  return sets;
}

/**
 * 类目选项的内容签名，同一份语料只算一次。
 *
 * 类目请求的缓存必须把它算进 key：`c0..cN` 是**由语料派生**的，
 * 模型答的 `c7` 只在这份选项表里才有意义。若缓存键只有 query，
 * 换一份语料就会把上一个 `c7` 解析成**另一个类号** —— 静默用错误的类目过滤。
 */
const classSignatureCache = new WeakMap<SearchDoc[], string>();

function classOptionsSignature(corpus: SearchDoc[]): string {
  let signature = classSignatureCache.get(corpus);
  if (signature === undefined) {
    const sets = classOptionSetsFor(corpus);
    const describe = (entries: ClassOptionSets['level1']): string =>
      entries.map(entry => `${entry.code}:${entry.label}`).join(',');
    signature = `L1[${describe(sets.level1)}]L2[${describe(sets.detail)}]`;
    classSignatureCache.set(corpus, signature);
  }
  return signature;
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
  /** 模型档位题推出的年份/评分条件（尚未决定是否升级成硬过滤）；类目不在此列（见 `ClassReading`） */
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
    const request = buildUnderstandRequest(query, corpusSize, model);
    const result = await judge(request, signal);
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
    const genreChoice = genre && genre.type === 'choice' ? genre.choice : null;
    const wantsFiction = genreChoice === 'fiction' ? 1 : genreChoice === 'nonfiction' ? 0 : 0.5;
    // 只有 `nonfiction` 才能升级成硬排除。
    // 「**只要**虚构」不走这里 —— `callClasses: ['I']` 已经能表达（`isFictionClc` 判的就是 I 类），
    // 所以虚构维度缺的一直是「排除」这一个方向。
    const excludeFiction = genreChoice === 'nonfiction';

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
          ...(ratingFloor > 0 ? { minRating: ratingFloor } : {}),
          ...(excludeFiction ? { excludeFiction: true } : {})
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

// ── 阶段 ①b：类目判断（独立请求，与意图 / 召回并发）────────────────────────────
interface ClassReading {
  /** 合并后的类号（尚未过否定门与「字面证据优先」门）；缺省 = 不设类目条件 */
  callClasses?: string[];
  /** 本请求自己的 `negation_present`：否定门不回头依赖意图请求 */
  negation: number;
}

/**
 * 两级类目题的合并规则：**退回较粗的 l1**。
 *
 * | l1 | l2 | 结果 | 理由 |
 * |---|---|---|---|
 * | `__none__` | 任意 | 不设条件 | 一级题已在说「不是在按类目筛」；二级题多半是照着主题词猜的，采信它会误删 |
 * | X | `__none__` / 与 X 不同源 | X | 两级不一致 = 模型不确定 → 取更粗的，宁可不过滤也不误删 |
 * | X | X 下的具体类 | 具体类 | 唯一「更精确且可信」的情形 |
 *
 * 「同源」统一用 `resolveClcCode(...).level1`（查表）判定，不靠字符串切前缀 ——
 * T 类的二级是 `TB`/`TP`/`TU` 这类双字母，切片会错。
 */
function mergeClassReading(level1?: string, detail?: string): string[] | undefined {
  if (level1 === undefined) return undefined;
  if (detail !== undefined && resolveClcCode(detail).level1?.code === level1) return [detail];
  return [level1];
}

async function understandClass(
  query: string,
  sets: ClassOptionSets,
  judge: JudgeFn,
  model: string,
  signal?: AbortSignal
): Promise<{ value: ClassReading; failed: boolean; ms: number }> {
  const started = Date.now();
  try {
    const built = buildClassRequest(query, sets, model);
    const result = await judge(built.request, signal);
    /** `resolveClassKey` 是唯一还原点：`__none__` 与未知 key 一律 undefined */
    const pick = (key: string, map: ClassOptionMap): string | undefined => {
      const answer = result.answers[key];
      return answer && answer.type === 'choice' ? resolveClassKey(map, answer.choice) : undefined;
    };
    const callClasses = mergeClassReading(
      pick(CALL_CLASS_L1_KEY, built.level1Map),
      pick(CALL_CLASS_L2_KEY, built.detailMap)
    );
    const negationAnswer = result.answers.negation_present;
    return {
      value: {
        ...(callClasses !== undefined ? { callClasses } : {}),
        negation: negationAnswer && negationAnswer.type === 'noul' ? negationAnswer.noul : 0
      },
      failed: false,
      ms: Date.now() - started
    };
  } catch (error) {
    logger.error('类目判断失败，年份/评分条件照常生效', {
      message: error instanceof Error ? error.message : String(error)
    });
    // 失败即不设类目条件；否定取 0（此时没有任何类目条件可被它启用）
    return { value: { negation: 0 }, failed: true, ms: Date.now() - started };
  }
}

// ── 阶段 ②：wide 全库分片（仅 deep）────────────────────────────────────────
async function runWide(
  query: string,
  corpus: SearchDoc[],
  /** 已由代码硬过滤保证的条件（人类可读）—— 只能是**确定性**那一层，见调用点注释 */
  enforced: readonly string[],
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
      const { request } = buildWideRequest(query, shard, enforced, model);
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
/**
 * 已生效的硬条件 → 给人/模型看的一句话列表，供精排知道「哪些条件已经不用它操心」。
 *
 * 与 `plan.applied` **同源**（不另建一套判定），类目名走 `clc.ts` 查表。
 */
function describeApplied(applied: AppliedConstraint[]): string[] {
  const labels: string[] = [];
  for (const entry of applied) {
    switch (entry.field) {
      case 'pubYearFrom':
        labels.push(`出版年 ≥ ${entry.value}`);
        break;
      case 'minRating':
        labels.push(`评分 ≥ ${entry.value}`);
        break;
      case 'excludeFiction':
        labels.push('排除虚构类');
        break;
      case 'callClasses': {
        const codes = Array.isArray(entry.value) ? entry.value : [];
        const named = codes.map(code => {
          const node = findClcClass(code);
          return node ? `${node.code} ${node.label}` : code;
        });
        labels.push(`中图法类目属于 ${named.join('、')}`);
        break;
      }
    }
  }
  return labels;
}

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
  /** 已由代码硬过滤保证的条件（人类可读），精排据此不必再判它们 */
  enforced: readonly string[],
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
    batches.map(batch => judge(buildRerankRequest(query, batch, enforced, model).request, signal))
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
function toResultItem(
  candidate: ScoredCandidate,
  passedGate = true,
  /** 本批 `choice(best)` 的 `__none__` 概率；只作展示与排查，不参与门控（见 `rank.ts::eligibility`） */
  pNone: number | null = null
): SearchResultItem {
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
      rankScore: candidate.rankScore,
      pNone
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
        rankScore: 0,
        // 精排未跑（rerank 不可用），不存在 p_none
        pNone: null
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
 * **请求期即可确定**的硬条件：规则层（用户原句的字面条件）∪ 请求级 `filters`（调用方显式传参），
 * 同名数值下限取更强的一方。
 *
 * 单独拆出来的理由：这一份在**两条 lane 开跑之前**就算得完，因此可以下推给
 * `recall.ts::buildAllowSet`，让过滤发生在 lane 的 top-K 截断**之前**。
 * 模型档位不在此列 —— 它与 lane 结果并发返回（图 1 的投机并发），物理上赶不上，
 * 只能融合后补一次过滤。两者共用 `recall.ts::compileDocFilter` 这一份判定，不存在两套标准。
 */
function deterministicConstraints(
  rule: SearchFilters,
  requested: SearchFilters | undefined
): { filters: SearchFilters; applied: AppliedConstraint[] } {
  const filters: SearchFilters = {};
  const applied: AppliedConstraint[] = [];

  // ① 规则层：字面条件，永远生效
  if (rule.minRating !== undefined) {
    filters.minRating = rule.minRating;
    applied.push({ field: 'minRating', value: rule.minRating, source: 'rule' });
  }
  if (rule.pubYearFrom !== undefined) {
    filters.pubYearFrom = rule.pubYearFrom;
    applied.push({ field: 'pubYearFrom', value: rule.pubYearFrom, source: 'rule' });
  }
  if (rule.excludeFiction) {
    filters.excludeFiction = true;
    applied.push({ field: 'excludeFiction', value: true, source: 'rule' });
  }

  // ② 请求级 filters：显式传参，数值下限取更强约束
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
    // 调用方显式传的类目：字面/显式证据优先，模型侧给出的会被它顶掉（见 resolveConstraints）
    if (requested.callClasses && requested.callClasses.length > 0) {
      const callClasses = [...requested.callClasses];
      filters.callClasses = callClasses;
      applied.push({ field: 'callClasses', value: callClasses, source: 'api' });
    }
  }

  return { filters, applied };
}

/**
 * 在确定性硬条件之上叠加**模型推出的条件**（年份/评分来自意图请求的档位题，类目来自独立的类目请求）。
 *
 * 年份/评分三道门全过才升级成硬过滤：
 * 1. 句中没有否定表达（`negation` ≤ `negationMax`）—— 「不要 2015 年以后」不能被反过来执行；
 * 2. 模型认为它是硬条件（`strictness` ≥ `hardStrictness`）；
 * 3. 确定性层没有给出同名条件（字面证据优先，避免两套标准）。
 *
 * 不满足时进入 `plan.dropped`：模型可以提出条件，但不能单方面删结果（延续 facets「只能微调」的纪律）。
 */
function resolveConstraints(args: {
  base: { filters: SearchFilters; applied: AppliedConstraint[] };
  model: SearchFilters;
  strictness: number;
  negation: number;
  /** 生效门槛（默认来自 tuning.ts，可被环境变量覆盖） */
  hardStrictness: number;
  negationMax: number;
  /** 类目请求自己的否定概率（它自包含，不回头依赖意图请求 —— 两边各自失败互不牵连） */
  negated: number;
  /** 类目请求给出的类号（已按「退回较粗的 l1」合并完毕） */
  modelClasses?: string[];
  terms: string[];
}): { filters: SearchFilters; plan: QueryPlanTrace } {
  const filters: SearchFilters = { ...args.base.filters };
  const applied: AppliedConstraint[] = [...args.base.applied];
  const dropped: DroppedConstraint[] = [];

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

  // 虚构维度：与年份/评分共用 `constraint_strictness` 那道门 ——
  // 那道题的题面本来就写着「年份、评分、**虚构与否**是不是必须满足的硬条件」。
  //
  // ⚠️ 唯一一道**不看否定门**的条件，与年份/评分刻意相反：
  // `genre_preference` 问的是「想要虚构还是非虚构」，极性已经包含在答案里 ——
  // 「不要小说」的否定是**构成**这个条件的表达，把它当「反向执行」拦下恰好会拦掉正确行为。
  // 安全性由方向保证：只有 `nonfiction` 才会走到这里，所以「不要非虚构」只会变成「不筛」，不会反向。
  if (args.model.excludeFiction === true) {
    if (filters.excludeFiction) {
      dropped.push({ field: 'excludeFiction', value: true, reason: 'rule-conflict' });
    } else if (!strict) {
      dropped.push({ field: 'excludeFiction', value: true, reason: 'soft' });
    } else {
      filters.excludeFiction = true;
      applied.push({ field: 'excludeFiction', value: true, source: 'model' });
    }
  }

  // 类目条件：两道门，**不看 `constraint_strictness`**。
  // 那道题问的是「年份/评分/是否虚构是不是必须满足的硬条件」，与类目不是同一个判断；
  // 而类目题本身就是在问「是不是在按类目筛」—— 模型给出具体类目（而非 `__none__`）
  // 已经是这道题的答案，再叠一道 strictness 等于把同一个信号数两遍。
  // 保留的两道门：确定性层已有类目则让位（字面/显式证据优先）；句中有否定则一律不用
  // （「不要历史类的」不能被反向执行成「只要历史类」）。
  const modelClasses = args.modelClasses;
  if (modelClasses && modelClasses.length > 0) {
    if (filters.callClasses !== undefined) {
      dropped.push({ field: 'callClasses', value: modelClasses, reason: 'rule-conflict' });
    } else if (args.negated > args.negationMax) {
      dropped.push({ field: 'callClasses', value: modelClasses, reason: 'negated' });
    } else {
      filters.callClasses = [...modelClasses];
      applied.push({ field: 'callClasses', value: [...modelClasses], source: 'model' });
    }
  }

  return { filters, plan: { terms: args.terms, applied, dropped } };
}

/**
 * 合并两轮召回结果：同一 docId 取名次分较高的一次，按分数降序截断。
 *
 * 用于两段式的第二轮 —— 第二轮在**更严格的允许集合内**重跑 lane，
 * 能捞回第一轮 top-K 之外、却被类目条件排除在候选之外的书。
 */
function mergeRecall(a: RecallResult[], b: RecallResult[], limit: number): RecallResult[] {
  const byId = new Map<string, RecallResult>();
  for (const result of [...a, ...b]) {
    const existing = byId.get(result.docId);
    if (!existing || result.score > existing.score) byId.set(result.docId, result);
  }
  return [...byId.values()].sort((x, y) => y.score - x.score).slice(0, limit);
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
    classMs: 0,
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
        rankScore: 1,
        // 精确命中走 0 次 Jev 直通，没有精排批、也没有 p_none
        pNone: null
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
      abstainReason: null,
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

  // ── ① + ①b + 2A/2B 投机并发：两次 Jev 与两条召回同时发出，绝不串行等待 ────────
  // 缓存键用**原句**（归一化后）而非降噪产物 `core`：降噪是有损的，
  // 而意图里还带着模型档位推出的硬条件，用有损键会让两条不同问题共用一份约束。
  // 版本号 v2：题型从 noul 换成 score/choice，旧缓存不可复用。
  // 版本号 v4：`call_class` 已移出本次请求（拆成独立的类目请求），题集变了，旧缓存不可复用。
  const understandKey = `v4|${mode}|${normalizeText(normalized.raw)}`;
  const cachedUnderstanding = cacheGet<Understanding>(understandKey);
  const understandPromise = cachedUnderstanding
    ? Promise.resolve({ value: cachedUnderstanding, failed: false, ms: 0 })
    : understand(normalized.raw, corpus.length, trackedJudge, model, signal).then(outcome => {
        if (!outcome.failed) cacheSet(understandKey, outcome.value);
        return outcome;
      });

  // 类目请求单独缓存（且必须带上类目选项签名 —— `c0..cN` 只在那一份选项表里有意义）。
  // 独立缓存还有一个好处：「类目识别失败」不会把意图结论也标脏。
  const classKey = `c1|${classOptionsSignature(corpus)}|${normalizeText(normalized.raw)}`;
  const cachedClass = cacheGet<ClassReading>(classKey);
  const classPromise = cachedClass
    ? Promise.resolve({ value: cachedClass, failed: false, ms: 0 })
    : understandClass(normalized.raw, classOptionSetsFor(corpus), trackedJudge, model, signal).then(
        outcome => {
          if (!outcome.failed) cacheSet(classKey, outcome.value);
          return outcome;
        }
      );

  const deepTopK =
    mode === 'deep' ? RERANK_TOP_K + tuning.effective.deepTopKSlack : RERANK_TOP_K;

  // 请求期即可确定的硬条件（原句规则 + API 显式传参）在两条 lane 开跑之前就算完，
  // 编译成允许集合下推给 lane —— 让过滤发生在 top-K **截断之前**。
  // 不这么做时，一个筛选性强的条件（如「2025 年后」+「K 类」）会把两路各自的前 N 名
  // 大部分滤掉，融合后候选不足 → 误报「馆藏里没有」。下推不改变判定本身（同一份 compileDocFilter）。
  // 模型档位推出的条件赶不上这一步（它与 lane 结果并发返回），只能融合后补过滤。
  const deterministic = deterministicConstraints(
    explicitToFilters(normalized.explicit),
    input.filters
  );
  const allow = buildAllowSet(corpus, deterministic.filters);

  const lanesPromise = recallLanes(
    { raw: normalized.raw, core: normalized.terms, allow },
    [timedLexical, denseLane]
  );

  const [understanding, laneResults, classReading] = await Promise.all([
    understandPromise,
    lanesPromise,
    classPromise
  ]);
  timing.understandMs = understanding.ms;
  timing.classMs = classReading.ms;
  if (understanding.failed) degraded.push('understand');
  // 独立 degraded code：类目识别失败只丢类目条件，年份/评分档位与 facets 照常生效
  if (classReading.failed) degraded.push('understand-class');

  // ── 2C wide（仅 deep，且 needs_wider_recall 高置信）：作为第三条 lane 并入 RRF ─
  let allLaneResults = laneResults;
  if (mode === 'deep' && understanding.value.needsWiderRecall > tuning.effective.widerRecallTrigger) {
    // wide 只在**已通过确定性硬条件**的书里分片：条件越严，片数越少，Jev 请求数越少。
    // `enforced` 因此只能给确定性那一层（规则 + API）：模型档位推出的条件此刻还没裁决
    // （`resolveConstraints` 在 wide 之后），而这批分片的范围本来也正是它算出来的允许集合。
    const wideEligible = allow === null ? corpus : corpus.filter(doc => allow.has(doc.id));
    const wide = await runWide(
      normalized.raw,
      wideEligible,
      describeApplied(deterministic.applied),
      trackedJudge,
      model,
      degraded,
      signal
    );
    timing.wideMs = wide.ms;
    if (wide.results.length > 0) {
      allLaneResults = [...laneResults, wide.results];
    }
  }

  const constraints = resolveConstraints({
    base: deterministic,
    model: understanding.value.modelConstraints,
    strictness: understanding.value.strictness,
    negation: understanding.value.negation,
    negated: classReading.value.negation,
    modelClasses: classReading.value.callClasses,
    hardStrictness: tuning.effective.jevHardStrictness,
    negationMax: tuning.effective.jevNegationMax,
    terms: normalized.terms
  });
  // 被丢弃的模型约束不标 degraded（不是降级，是可解释的策略结果），看 intent.plan.dropped
  let fused = fuseAndFilter(allLaneResults, docs, constraints.filters, deepTopK);

  // ── 两段式：模型推出的硬条件赶不上下推时补一次本地召回 ──────────────────────
  // 模型答案与两条 lane **并发**返回，物理上赶不上开跑前的下推（见 deterministicConstraints）。
  // 这类条件往往很选择性（类目实测 K92 只占全馆 5/509 ≈ 1%；「近两年」同样只剩一小撮），
  // 融合后 top-K 里常常一本都没有 —— 「馆藏里明明有」于是被误报成「没有」。
  // 只在候选确实偏薄时付这一次本地重跑：查询向量已在 LRU、understand 已缓存 → **0 次 Jev 请求**。
  //
  // 触发面覆盖**所有**模型推出的硬条件（年份/评分/虚构/类目），不是只有类目：
  // 它们升级成硬过滤的路径完全一样（`resolveConstraints`），只让类目享受补救是不对称的。
  // 判据用 `source === 'model'`：`resolveConstraints` 只在确定性层没有同名条件时才记 'model'，
  // 所以它天然等价于「模型新加、且赶不上下推」；确定性条件不必重跑 —— 它已下推，
  // 第一轮 lane 就只搜过允许集合，用同一份条件重跑会得到完全一样的结果。
  const modelOnlyHardFilter = constraints.plan.applied.some(entry => entry.source === 'model');
  if (modelOnlyHardFilter && fused.length < RERANK_TOP_K) {
    const retryAllow = buildAllowSet(corpus, constraints.filters);
    const retryLanes = await recallLanes(
      { raw: normalized.raw, core: normalized.terms, allow: retryAllow },
      [timedLexical, denseLane]
    );
    fused = mergeRecall(
      fused,
      fuseAndFilter(retryLanes, docs, constraints.filters, deepTopK),
      deepTopK
    );
  }

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
      abstainReason: 'hard-filter',
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
    // 把已生效的硬条件告诉精排：`query` 是原句，里面一半内容已由代码保证
    describeApplied(constraints.plan.applied),
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
      abstainReason: null,
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

  // 条件型查询（筛选/书单）不用批级的「有没有在主题上回应 query」来弃权：
  // 「评分大于8分」这类句子的主词是「作品」，条件由硬过滤负责，模型答「没回应主题」是错答而非误判
  const facetQuery = isFacetQuery(understanding.value.type, constraints.plan.applied);
  const outcome = eligibility(
    rerankCandidates,
    {
      batchHasMatch: rerankOutcome.batchHasMatch,
      facetQuery
    },
    tuning.effective
  );
  timing.rankMs = Date.now() - rankStarted;

  // 「加载更多」：全部已判分候选里首屏没展示的 = 通过门控的溢出项 + 未上首屏的其余项
  // （含被批级否决压下来的），统一按 relevancePct → matchPct → recallRank 降序；不触发新 Jev 请求（§6.5）。
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
    .map(entry => toResultItem(entry.candidate, entry.passedGate, rerankOutcome.pNone));

  return finalize({
    query: normalized.raw,
    mode,
    basedOn: 'retrieval',
    intent,
    results: outcome.items.slice(0, limit).map(item => toResultItem(item, true, rerankOutcome.pNone)),
    more,
    abstained: outcome.abstained,
    abstainReason: outcome.reason,
    degraded,
    judge: judgeMeta
  });
}
