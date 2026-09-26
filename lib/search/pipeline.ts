import { systemOne } from '@/lib/jev/client';
import { JevDisabledError } from '@/lib/jev/errors';
import type { SystemOneResult } from '@/lib/jev/types';
import { buildIndex, termIdf } from './bm25';
import {
  LIMIT_DEFAULT,
  LIMIT_MAX,
  RERANK_TOP_K,
  defaultMode,
  readEmbeddingConfig,
  readJevConfig
} from './config';
import { getSearchCorpus } from './corpus';
import { DenseIndexMismatch, loadVectors, type EncodedQuery, type VectorIndex } from './dense';
import { createDenseLane, createLexicalLane } from './lanes';
import { classOptionSetsFromCorpus } from './options';
import { normalizeQuery, explicitToFilters } from './query';
import { eligibility, facetBonusFor, isFacetQuery, type RerankCandidate } from './rank';
import { buildAllowSet, fuseAndFilter, recallLanes } from './recall';
import { cacheGet, cacheSet } from './judge-cache';
import { neutralFacets, understand, understandClass } from './understand';
import { runWide } from './wide';
import { runRerank } from './rerank';
import { describeApplied, deterministicConstraints, resolveConstraints } from './constraints';
import { exactMatchItem, toResultItem, unrankedFromRecall } from './result';
import { normalizeText } from './tokenize';
import { getTuning } from './tuning';
import type { ClassOptionSets } from './options';
import type { ClassReading, Understanding } from './understand';
import type {
  JudgeFn,
  JudgeMeta,
  QueryIntent,
  RecallLane,
  RecallResult,
  SearchDoc,
  SearchInput,
  SearchMode,
  SearchTiming,
  SemanticSearchResponse,
  SearchProgressCallback
} from './types';

/**
 * 检索主链路编排：确定性前置 → 意图/召回并发 → wide（deep）→ RRF → 精排 → 门控 → 排序。
 *
 * 本文件**只有编排**：各阶段（意图 / 类目 / wide / 精排）、条件裁决、结果组装
 * 与跨请求状态（缓存、预算）都在各自的模块里。这里负责的是它们之间的
 * **顺序、并发与降级**。
 *
 * 两条不变量：
 * - 模型失败 = 降级而非中断，且降级必须可见（`degraded[]`）；
 * - 绝不返回「0 结果」伪装成正常结果（弃权必须带 `abstainReason`）。
 */

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

/**
 * 确定性前置：**精确匹配**（条码 / ISBN / 索书号 / 完整书名）直接返回该书，0 次 Jev。
 *
 * 只做精确匹配、不做模糊命中，避免检索漂移 —— 这既是性能优化，
 * 也符合「本地权威优先于模型」的原则。
 */
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

export async function runSemanticSearch(
  input: SearchInput,
  deps: PipelineDeps = {},
  signal?: AbortSignal,
  onProgress?: SearchProgressCallback
): Promise<SemanticSearchResponse> {
  const startedAt = Date.now();
  const now = deps.now ? deps.now() : new Date();
  const mode: SearchMode = input.mode ?? defaultMode();
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
      results: [exactMatchItem(exact)],
      more: [],
      abstained: false,
      abstainReason: null,
      degraded,
      judge: judgeMeta
    });
  }

  // ── 流式进度：准备阶段完成 ──
  onProgress?.({ event: 'phase', data: { stage: 'preparing', terms: normalized.terms, corpusSize: corpus.length } });

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

  onProgress?.({ event: 'phase', data: { stage: 'scanning' } });
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

  onProgress?.({
    event: 'phase',
    data: {
      stage: 'analyzed',
      intent: understanding.value.type,
      confidence: understanding.value.confidence,
      lexicalHits,
      denseHits,
      fusedCandidates: fused.length
    }
  });

  /** 本次实际参与的 lane id（wide 命中时才出现），两条返回路径共用同一份推导 */
  const recallLaneIds = [
    ...new Set(allLaneResults.flatMap(lane => lane.map(result => result.lanes)).flat())
  ];

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
          lanes: recallLaneIds,
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
  onProgress?.({ event: 'phase', data: { stage: 'reranking', candidateCount: candidates.length } });
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
      lanes: recallLaneIds,
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

  const resultItems = outcome.items.slice(0, limit).map(item => toResultItem(item, true, rerankOutcome.pNone));
  for (let i = 0; i < resultItems.length; i++) {
    const ri = resultItems[i];
    onProgress?.({
      event: 'hit',
      data: {
        index: i,
        total: resultItems.length,
        book: {
          title: ri.book.title,
          author: ri.book.author,
          coverUrl: ri.book.coverThumbnailUrl || ri.book.coverImageUrl || ri.book.coverUrl || ''
        },
        relevancePct: ri.relevancePct
      }
    });
  }

  return finalize({
    query: normalized.raw,
    mode,
    basedOn: 'retrieval',
    intent,
    results: resultItems,
    more,
    abstained: outcome.abstained,
    abstainReason: outcome.reason,
    degraded,
    judge: judgeMeta
  });
}
