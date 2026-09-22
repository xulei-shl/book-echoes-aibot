import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FIT_LEVELS,
  RATING_FLOOR_LEVELS,
  RECENCY_LEVELS,
  STYLE_LEVELS,
  WIDER_RECALL_LEVELS,
  YEAR_FLOOR_LEVELS
} from '@/lib/jev/questions';
import type { SystemOneRequest, SystemOneResult, Answer } from '@/lib/jev/types';
import { FIT_GATE } from '@/lib/search/tuning';
import { resetPipelineState, runSemanticSearch, type JudgeFn } from '@/lib/search/pipeline';
import type { IntentType, SearchDoc } from '@/lib/search/types';

function makeDoc(
  id: string,
  title: string,
  reason: string,
  overrides: { rating?: number; pubYear?: number; callNumber?: string } = {}
): SearchDoc {
  const rating = overrides.rating ?? 8.2;
  const pubYear = overrides.pubYear ?? 2020;
  const callNumber = overrides.callNumber ?? 'B842.6';
  return {
    id,
    sourceId: '2026-06',
    book: {
      id,
      month: '2026-06',
      title,
      author: '某作者',
      publisher: '某出版社',
      pubYear: String(pubYear),
      pages: '200',
      rating: String(rating),
      callNumber,
      callNumberLink: '',
      isbn: `isbn-${id}`,
      recommendation: '',
      summary: `${title} 的内容简介`,
      authorIntro: '',
      catalog: '',
      coverUrl: ''
    },
    fields: {
      title,
      subtitle: '',
      author: '某作者',
      translator: '',
      publisher: '某出版社',
      subjects: callNumber,
      reason,
      summary: `${title} 的内容简介`,
      toc: ''
    },
    exact: { isbn: `isbn-${id}`, barcode: id, callNumber },
    numeric: { rating, pubYear, pages: 200 },
    hash: id
  };
}

const corpus: SearchDoc[] = [
  makeDoc('d1', '焦虑的意义', '存在主义心理学专著', { pubYear: 2024, rating: 8.5 }),
  makeDoc('d2', '焦虑与自由', '哲学随笔'),
  makeDoc('d3', '生活的焦虑', '日常心理', { pubYear: 2023, rating: 7.5 }),
  makeDoc('d4', '焦虑时代', '社会学观察', { pubYear: 2018, rating: 6.5 })
];

const noul = (value: number): Answer => ({ type: 'noul', noul: value });
const choice = (
  probabilities: Record<string, number>,
  chosen: string,
  confidence = 0.8
): Answer => ({ type: 'choice', choice: chosen, probabilities, confidence });

/**
 * 构造自洽的 score 回答：把档位位置拆到相邻两级上，
 * 与 decode 的「score = Σ 级号 × 概率」校验一致。
 */
const score = (levelCount: number, position: number, confidence = 0.8): Answer => {
  const lower = Math.floor(position);
  const upper = Math.min(levelCount - 1, lower + 1);
  const probabilities: Record<string, number> = {};
  const legend: Record<string, unknown> = {};
  for (let i = 0; i < levelCount; i += 1) {
    probabilities[String(i)] = 0;
    legend[String(i)] = `第${i}档`;
  }
  if (lower === upper) {
    probabilities[String(lower)] = 1;
  } else {
    probabilities[String(lower)] = 1 - (position - lower);
    probabilities[String(upper)] = position - lower;
  }
  return { type: 'score', score: position, confidence, legend, probabilities };
};

/** 0..1 的偏好 → 某张档位表上的位置 */
const levelAt = (levels: readonly unknown[], preference: number): number =>
  preference * (levels.length - 1);

interface StubOptions {
  understand?: 'ok' | 'fail';
  /** 意图 choice 胜出的类型（默认 concept） */
  intentType?: IntentType;
  /** 精排批级 noul `batch_has_match` 的值（默认 0.9 = true） */
  batchHasMatch?: number;
  /** 返回每本候选的 fit（0..1）；'fail' 表示整批失败 */
  rerank?: 'ok' | 'fail' | ((index: number) => number);
  pNone?: number;
  bestProbabilities?: (index: number) => number;
  needsWiderRecall?: number;
  widePick?: 'none' | 'top';
  /** 模型给出的年份档位（0 = 没有要求） */
  yearFloor?: number;
  /** 模型给出的评分档位（0 = 没有要求） */
  ratingFloor?: number;
  /** 模型认为「这是硬条件」的概率 */
  strictness?: number;
  /** 句中含否定表达的概率 */
  negation?: number;
  /** 片级贴合档位（按片内标题决定），跨片可比 */
  wideFitByShard?: (titles: string[]) => number;
}

function makeJudge(options: StubOptions = {}) {
  const calls: SystemOneRequest[] = [];
  const judge: JudgeFn = async (request): Promise<SystemOneResult> => {
    calls.push(request);
    const keys = Object.keys(request.questions);
    const answers: Record<string, Answer> = {};

    if (keys.includes('intent')) {
      if (options.understand === 'fail') throw new Error('understand failed');
      // choice 必须自洽：胜出项就是 argmax，概率和 = 1
      const intentType = options.intentType ?? 'concept';
      const intentProbabilities: Record<string, number> = {
        concept: 0.05,
        work: 0.05,
        similar: 0.05,
        list: 0.05,
        other: 0.05
      };
      intentProbabilities[intentType] = 0.8;
      answers.intent = choice(intentProbabilities, intentType);
      answers.needs_wider_recall = score(
        WIDER_RECALL_LEVELS.length,
        levelAt(WIDER_RECALL_LEVELS, options.needsWiderRecall ?? 0.2)
      );
      answers.genre_preference = choice(
        { fiction: 0.1, any: 0.8, nonfiction: 0.1 },
        'any'
      );
      answers.recency_preference = score(RECENCY_LEVELS.length, levelAt(RECENCY_LEVELS, 0.5));
      answers.style_preference = score(STYLE_LEVELS.length, levelAt(STYLE_LEVELS, 0.5));
      answers.wants_verified = noul(0.6);
      answers.year_floor = score(YEAR_FLOOR_LEVELS.length, options.yearFloor ?? 0);
      answers.rating_floor = score(RATING_FLOOR_LEVELS.length, options.ratingFloor ?? 0);
      answers.constraint_strictness = noul(options.strictness ?? 0);
      answers.negation_present = noul(options.negation ?? 0);
    } else if (keys.includes('pick')) {
      const shard = (request.state as { shard: { id: string; title: string }[] }).shard;
      if (options.widePick === 'top') {
        const probabilities: Record<string, number> = { __none__: 0.1 };
        shard.forEach((item, index) => {
          probabilities[item.id] = index === 0 ? 0.7 : 0.1;
        });
        answers.pick = choice(probabilities, shard[0].id);
      } else {
        const probabilities: Record<string, number> = { __none__: 0.9 };
        shard.forEach(item => {
          probabilities[item.id] = 0.1 / Math.max(1, shard.length);
        });
        answers.pick = choice(probabilities, '__none__');
      }
      answers.shard_fit = score(
        FIT_LEVELS.length,
        options.wideFitByShard ? options.wideFitByShard(shard.map(item => item.title)) : 0
      );
    } else {
      if (options.rerank === 'fail') throw new Error('rerank failed');
      const candidates = (request.state as { candidates: { id: string }[] }).candidates;
      const noneP = options.pNone ?? 0.1;
      const probabilities: Record<string, number> = { __none__: noneP };
      let remaining = 1 - noneP;
      candidates.forEach((item, index) => {
        const value = options.bestProbabilities
          ? options.bestProbabilities(index)
          : remaining / candidates.length;
        probabilities[item.id] = value;
        remaining -= value;
      });
      const argmax = Object.entries(probabilities).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      answers.best = choice(probabilities, argmax, 0.5);
      answers.batch_has_match = noul(options.batchHasMatch ?? 0.9);
      candidates.forEach((item, index) => {
        const fitFn = typeof options.rerank === 'function' ? options.rerank : () => 0.8;
        // 逐本用 score 档位（而不是 noul 是非题），fit = 档位位置 / (档数-1)
        answers[`fits::${item.id}`] = score(FIT_LEVELS.length, fitFn(index) * (FIT_LEVELS.length - 1));
      });
    }

    return {
      model: 'stub-1.0',
      answers,
      usage: { input_tokens: 100, output_tokens: 10 },
      requestedModel: 'stub',
      attempts: 1,
      roundTripMs: 1
    };
  };
  return { judge, calls };
}

beforeEach(() => {
  resetPipelineState();
});

afterEach(() => {
  delete process.env.SEMANTIC_SEARCH_WIDE_SHARD;
  delete process.env.SEMANTIC_SEARCH_FIT_GATE_POSITION;
  delete process.env.SEMANTIC_SEARCH_MIN_RESULTS;
});

describe('runSemanticSearch', () => {
  it('端到端：召回 → 精排 → 门控 → 排序，relevancePct 单调不增', async () => {
    const { judge } = makeJudge({
      rerank: index => (index === 0 ? 0.9 : index === 1 ? 0.6 : 0.2),
      bestProbabilities: index => (index === 0 ? 0.5 : index === 1 ? 0.3 : 0.15)
    });
    const result = await runSemanticSearch(
      { query: '焦虑', limit: 10 },
      { judge, corpus, vectors: null, model: 'test-model' }
    );

    expect(result.basedOn).toBe('retrieval');
    expect(result.abstained).toBe(false);
    expect(result.results).toHaveLength(2);
    expect(result.results.map(item => item.relevancePct)).toEqual([90, 60]);
    expect(result.results.every(item => item.ranked)).toBe(true);
    expect(result.intent.type).toBe('concept');
    expect(result.degraded).toContain('dense-unavailable');
    expect(result.judge.requestedModel).toBe('test-model');
    expect(result.judge.returnedModel).toBe('stub-1.0');
  });

  it('无匹配时 abstained 为一等状态，results 为空', async () => {
    const { judge } = makeJudge({
      rerank: () => 0.1,
      pNone: 0.2,
      bestProbabilities: () => 0.05
    });
    const result = await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus, vectors: null }
    );
    expect(result.abstained).toBe(true);
    expect(result.abstainReason).toBe('fit');
    expect(result.results).toEqual([]);
    // 弃权不污染主列表，但已判分候选仍保留在 more（由用户显式展开）
    expect(result.more.length).toBeGreaterThan(0);
    expect(result.more.every(item => item.passedGate === false)).toBe(true);
  });

  it('rerank 整批失败：结果仍返回、ranked=false、degraded 可见', async () => {
    const { judge } = makeJudge({ rerank: 'fail' });
    const result = await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus, vectors: null }
    );
    expect(result.abstained).toBe(false);
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.every(item => item.ranked === false)).toBe(true);
    expect(result.degraded).toContain('rerank');
  });

  it('understand 失败不中断主链路', async () => {
    const { judge } = makeJudge({ understand: 'fail' });
    const result = await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus, vectors: null }
    );
    expect(result.degraded).toContain('understand');
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('deep 模式在 needs_wider_recall 高时补发 wide 分片', async () => {
    const { judge, calls } = makeJudge({ needsWiderRecall: 0.9, widePick: 'top' });
    const result = await runSemanticSearch(
      { query: '焦虑', mode: 'deep' },
      { judge, corpus, vectors: null }
    );
    expect(calls.some(call => Object.keys(call.questions).includes('pick'))).toBe(true);
    expect(result.mode).toBe('deep');
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('fast 模式不补发 wide', async () => {
    const { judge, calls } = makeJudge({ needsWiderRecall: 0.9, widePick: 'top' });
    await runSemanticSearch({ query: '焦虑', mode: 'fast' }, { judge, corpus, vectors: null });
    expect(calls.some(call => Object.keys(call.questions).includes('pick'))).toBe(false);
  });

  it('精确命中（书名）0 次 Jev 直通', async () => {
    const { judge, calls } = makeJudge();
    const result = await runSemanticSearch(
      { query: '焦虑的意义' },
      { judge, corpus, vectors: null }
    );
    expect(result.basedOn).toBe('exact');
    expect(result.results).toHaveLength(1);
    expect(result.results[0].book.id).toBe('d1');
    expect(result.results[0].deepLink).toContain('focus=d1');
    expect(result.more).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('limit 生效', async () => {
    const { judge } = makeJudge({ rerank: () => 0.9, pNone: 0.05 });
    const result = await runSemanticSearch(
      { query: '焦虑', limit: 1 },
      { judge, corpus, vectors: null }
    );
    expect(result.results).toHaveLength(1);
  });

  it('查询句里的年份硬条件真正生效（含边界年）', async () => {
    const { judge } = makeJudge({ rerank: () => 0.9, pNone: 0.05 });
    // 「2018 年以后」为闭区间：d4(2018) 保留
    const inclusive = await runSemanticSearch(
      { query: '2018年以后出版的焦虑书' },
      { judge, corpus, vectors: null }
    );
    expect(inclusive.results.map(item => item.book.id)).toContain('d4');
    // 「2019 年以后」：d4(2018) 不满足 → 根本不入围
    const exclusive = await runSemanticSearch(
      { query: '2019年以后出版的焦虑书' },
      { judge, corpus, vectors: null }
    );
    expect(exclusive.results.map(item => item.book.id)).not.toContain('d4');
    expect(exclusive.results.length).toBeGreaterThan(0);
  });

  it('查询句里的评分下限把低分书挡在门外', async () => {
    const { judge } = makeJudge({ rerank: () => 0.9, pNone: 0.05 });
    const result = await runSemanticSearch(
      { query: '评分8分以上的焦虑书' },
      { judge, corpus, vectors: null }
    );
    // d4 评分 6.5、d3 评分 7.5 → 均不入围；出版年未设下限，2020/2024 都保留
    expect(result.results.map(item => item.book.id)).toEqual(
      expect.arrayContaining(['d1'])
    );
    expect(result.results.map(item => item.book.id)).not.toContain('d3');
    expect(result.results.map(item => item.book.id)).not.toContain('d4');
  });

  it('「不要小说」硬过滤掉 I 类索书号的书', async () => {
    const { judge } = makeJudge({ rerank: () => 0.9, pNone: 0.05 });
    const fictionCorpus: SearchDoc[] = [
      makeDoc('f1', '焦虑的旅程', '小说'),
      makeDoc('f2', '焦虑的旅程', '小说')
    ];
    fictionCorpus.forEach(doc => {
      doc.exact.callNumber = 'I247.5';
      doc.book.callNumber = 'I247.5';
    });
    const result = await runSemanticSearch(
      { query: '不要小说，焦虑的书' },
      { judge, corpus: fictionCorpus, vectors: null }
    );
    // 语料全部是 I 类虚构书：候选被硬条件清空 → 弃权而非硬凑
    expect(result.abstained).toBe(true);
    expect(result.abstainReason).toBe('hard-filter');
    expect(result.results).toEqual([]);
  });

  it('查询句条件与请求级 filters 取更强约束', async () => {
    const { judge } = makeJudge({ rerank: () => 0.9, pNone: 0.05 });
    const result = await runSemanticSearch(
      { query: '2020年以后出版的焦虑书', filters: { minRating: 8 } },
      { judge, corpus, vectors: null }
    );
    // 年份取 2020（强于无）、评分取 8（请求级唯一来源）→ d3(7.5) d4(6.5) 出局
    expect(result.results.map(item => item.book.id)).not.toContain('d3');
    expect(result.results.map(item => item.book.id)).not.toContain('d4');
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('硬条件过滤后无候选：诚实弃权，不烧 Jev 精排', async () => {
    const { judge, calls } = makeJudge({ rerank: () => 0.9, pNone: 0.05 });
    const result = await runSemanticSearch(
      { query: '2030年以后出版的焦虑书' },
      { judge, corpus, vectors: null }
    );
    expect(result.abstained).toBe(true);
    expect(result.abstainReason).toBe('hard-filter');
    expect(result.results).toEqual([]);
    // 只有意图 1 次请求；精排因候选为空未发生
    expect(calls.filter(call => 'best' in call.questions)).toHaveLength(0);
  });

  it('「加载更多」more 收集未展示的已判分候选，按相关度降序、不新增请求', async () => {
    const { judge, calls } = makeJudge({
      rerank: index => (index === 0 ? 0.9 : index === 1 ? 0.6 : 0.2),
      bestProbabilities: index => (index === 0 ? 0.5 : index === 1 ? 0.3 : 0.15)
    });
    const result = await runSemanticSearch(
      { query: '焦虑', limit: 1 },
      { judge, corpus, vectors: null }
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0].passedGate).toBe(true);
    // more = 通过门控的溢出项 + 未上首屏的其余项
    expect(result.more.length).toBeGreaterThan(0);
    expect(result.more.some(item => item.passedGate === false)).toBe(true);
    // 不变式：首屏 + 「加载更多」= 本次全部已判分候选，不重不漏
    expect(result.results.length + result.more.length).toBe(
      result.intent.retrieval.fusedCandidates
    );
    const pcts = result.more.map(item => item.relevancePct);
    expect([...pcts].sort((a, b) => b - a)).toEqual(pcts);

    // 「加载更多」不新增 Jev 请求：fast 仍是 1× understand + 1× rerank
    expect(calls.filter(call => 'intent' in call.questions)).toHaveLength(1);
    expect(calls.filter(call => 'best' in call.questions)).toHaveLength(1);
  });

  it('一次意图请求带齐三种题型（noul / choice / score），不额外增加往返', async () => {
    const { judge, calls } = makeJudge();
    const result = await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus, vectors: null }
    );
    const understand = calls.find(call => 'intent' in call.questions)!;
    const types = Object.values(understand.questions).map(question => question.type);
    expect(types).toContain('noul');
    expect(types).toContain('choice');
    expect(types).toContain('score');
    // 档位题都在同一个请求里并行，仍然只有 1 次意图请求
    expect(calls.filter(call => 'intent' in call.questions)).toHaveLength(1);
    expect(result.intent.facets).toEqual({
      wantsFiction: 0.5,
      wantsRecent: 0.5,
      avoidTheory: 0.5,
      wantsVerified: 0.6
    });
  });

  it('每本候选的相关度用 score 档位返回，why 里带档位与置信度', async () => {
    const { judge } = makeJudge({ rerank: index => (index === 0 ? 0.7 : 0.1), pNone: 0.05 });
    const result = await runSemanticSearch(
      { query: '焦虑', limit: 1 },
      { judge, corpus, vectors: null }
    );
    const top = result.results[0];
    expect(top.relevancePct).toBe(70);
    expect(top.why.fit).toBeCloseTo(0.7);
    expect(top.why.fitLevel).toBe(2);
    expect(top.why.fitConfidence).toBe(0.8);
  });

  it('模型档位硬条件：严格且无否定时升级成硬过滤，plan.applied 可见来源', async () => {
    const { judge } = makeJudge({
      rerank: () => 0.9,
      pNone: 0.05,
      yearFloor: 4, // = 「2020 年以后出版」
      strictness: 0.9,
      negation: 0.1
    });
    const result = await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus, vectors: null }
    );
    expect(result.results.map(item => item.book.id)).not.toContain('d4');
    expect(result.results.map(item => item.book.id)).toContain('d1');
    expect(result.intent.plan.applied).toEqual([
      { field: 'pubYearFrom', value: 2020, source: 'model' }
    ]);
    expect(result.intent.plan.dropped).toEqual([]);
  });

  it('模型档位只是倾向时不删结果，记入 plan.dropped（soft）', async () => {
    const { judge } = makeJudge({
      rerank: () => 0.9,
      pNone: 0.05,
      yearFloor: 4,
      strictness: 0.2
    });
    const result = await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus, vectors: null }
    );
    expect(result.results.map(item => item.book.id)).toContain('d4');
    expect(result.intent.plan.dropped).toEqual([
      { field: 'pubYearFrom', value: 2020, reason: 'soft' }
    ]);
  });

  it('句中有否定时模型约束被否决（不反向执行）', async () => {
    const { judge } = makeJudge({
      rerank: () => 0.9,
      pNone: 0.05,
      yearFloor: 4,
      strictness: 0.9,
      negation: 0.9
    });
    const result = await runSemanticSearch(
      { query: '不要 2020 年以后的新书，焦虑相关的' },
      { judge, corpus, vectors: null }
    );
    expect(result.results.map(item => item.book.id)).toContain('d4');
    expect(result.intent.plan.applied).toEqual([]);
    expect(result.intent.plan.dropped).toEqual([
      { field: 'pubYearFrom', value: 2020, reason: 'negated' }
    ]);
  });

  it('规则层与模型档位同名时以字面证据为准，模型约束记 rule-conflict', async () => {
    const { judge } = makeJudge({
      rerank: () => 0.9,
      pNone: 0.05,
      yearFloor: 1, // = 2000 以后（比句中的 2019 更弱）
      strictness: 0.9
    });
    const result = await runSemanticSearch(
      { query: '2019年以后出版的焦虑书' },
      { judge, corpus, vectors: null }
    );
    expect(result.intent.plan.applied).toEqual([
      { field: 'pubYearFrom', value: 2019, source: 'rule' }
    ]);
    expect(result.intent.plan.dropped).toEqual([
      { field: 'pubYearFrom', value: 2000, reason: 'rule-conflict' }
    ]);
    expect(result.results.map(item => item.book.id)).not.toContain('d4');
  });

  it('plan.terms 暴露真正送去词法 lane 的 term，数字不入词', async () => {
    const { judge } = makeJudge({ rerank: () => 0.9, pNone: 0.05 });
    const result = await runSemanticSearch(
      { query: '2015年以后出版的焦虑书' },
      { judge, corpus, vectors: null }
    );
    expect(result.intent.plan.terms).toContain('焦虑');
    expect(result.intent.plan.terms).not.toContain('2015');
  });

  it('环境变量覆盖在整条链路上生效，并随响应回传生效值', async () => {
    process.env.SEMANTIC_SEARCH_FIT_GATE_POSITION = '2.6'; // fitGate ≈ 0.867
    const { judge } = makeJudge({ rerank: () => 0.6, pNone: 0.05 });
    const result = await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus, vectors: null }
    );
    // fit 0.6 在默认门槛（0.30）下过得了，抬高门槛后全部出局 → 诚实弃权
    expect(result.abstained).toBe(true);
    expect(result.abstainReason).toBe('fit');
    expect(result.tuning.effective.fitGate).toBeCloseTo(2.6 / 3, 9);
    expect(result.tuning.overridden).toEqual([
      { env: 'SEMANTIC_SEARCH_FIT_GATE_POSITION', field: 'fitGatePosition', value: 2.6 }
    ]);
    expect(result.tuning.rejected).toEqual([]);
  });

  it('非法覆盖不会静默生效：响应里能看到被拒绝的项与原因', async () => {
    process.env.SEMANTIC_SEARCH_MIN_RESULTS = 'oops';
    const { judge } = makeJudge({ rerank: () => 0.9, pNone: 0.05 });
    const result = await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus, vectors: null }
    );
    expect(result.tuning.rejected).toEqual([
      { env: 'SEMANTIC_SEARCH_MIN_RESULTS', raw: 'oops', reason: '不是有限数字' }
    ]);
    expect(result.tuning.effective.minResults).toBe(1);
  });

  it('三条返回路径（精确命中 / 正常 / 弃权）都带调参快照', async () => {
    const { judge } = makeJudge({ rerank: () => 0.9, pNone: 0.05 });
    const responses = await Promise.all([
      runSemanticSearch({ query: '焦虑的意义' }, { judge, corpus, vectors: null }),
      runSemanticSearch({ query: '焦虑' }, { judge, corpus, vectors: null }),
      runSemanticSearch(
        { query: '2030年以后出版的焦虑书' },
        { judge, corpus, vectors: null }
      )
    ]);
    for (const result of responses) {
      expect(result.tuning.overridden).toEqual([]);
      expect(result.tuning.rejected).toEqual([]);
      expect(result.tuning.effective.fitGate).toBeCloseTo(FIT_GATE, 9);
    }
  });

  it('wide 跨片按贴合档位排序，而不是按分片顺序拼接', async () => {
    process.env.SEMANTIC_SEARCH_WIDE_SHARD = '2'; // 4 本 → 2 片
    const { judge } = makeJudge({
      needsWiderRecall: 1,
      widePick: 'top',
      // 第二片（含《焦虑时代》d4）整体更贴合
      wideFitByShard: titles => (titles.includes('焦虑时代') ? FIT_LEVELS.length - 1 : 0),
      rerank: index => (index === 0 ? 0.9 : 0.1),
      pNone: 0.05
    });
    const result = await runSemanticSearch(
      // 与馆藏词面零重合：词法 lane 命中为空，融合顺序完全由 wide 档位决定
      { query: '量子纠错制冷', mode: 'deep' },
      { judge, corpus, vectors: null }
    );
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].book.id).toBe('d3');
    expect(result.results[0].lanes).toContain('wide');
    expect(result.results[0].why.laneScores.wide).toBe(1);
  });

  it('回归：best.p 输给 __none__ 不再导致整批弃权', async () => {
    // 「世界艺术」形态：40 本候选互相分散概率，__none__ 只需赢过最大的那一本
    // pNone 0.9 → 每本只剩 0.1/N，旧门控会把整批 fit 达标的书全部拒掉
    const { judge } = makeJudge({ rerank: () => 0.68, pNone: 0.9 });
    const result = await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus, vectors: null }
    );
    expect(result.abstained).toBe(false);
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].relevancePct).toBe(68);
    // 单本 choice 概率远低于 p_none，但仍是合格结果
    expect(result.results[0].why.pNone).toBeCloseTo(0.9, 9);
    expect(result.results[0].matchPct).toBeLessThan(90);
    expect(result.results.every(item => item.passedGate)).toBe(true);
    expect(result.abstainReason).toBeNull();
  });

  it('回归：条件型查询不因批级 batch_has_match 否定而弃权', async () => {
    // 「评分大于8分的作品」形态：命题的主词是「作品」，条件由硬过滤负责，
    // 模型答「没有在主题上回应 query 的书」是错配的答案，不应据此把候选全藏起来
    const { judge } = makeJudge({
      intentType: 'other',
      rerank: () => 0.91,
      batchHasMatch: 0.1,
      pNone: 0.9
    });
    const result = await runSemanticSearch(
      { query: '评分大于8分的焦虑书' },
      { judge, corpus, vectors: null }
    );
    expect(result.intent.plan.applied).toEqual([
      { field: 'minRating', value: 8, source: 'rule' }
    ]);
    expect(result.abstained).toBe(false);
    expect(result.abstainReason).toBeNull();
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.every(item => item.relevancePct === 91)).toBe(true);
  });

  it('主题型查询仍然采信 batch_has_match = false，但 fit 达标的候选经 more 可达', async () => {
    const { judge } = makeJudge({
      intentType: 'concept',
      rerank: () => 0.91,
      batchHasMatch: 0.1
    });
    const result = await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus, vectors: null }
    );
    expect(result.intent.type).toBe('concept');
    expect(result.abstained).toBe(true);
    expect(result.abstainReason).toBe('batch');
    expect(result.results).toEqual([]);
    // 回归：批级否决只压首屏，不能把 fit 达标的候选藏到「哪都不显示」
    expect(result.more.length).toBeGreaterThan(0);
    expect(result.more.every(item => item.passedGate === false)).toBe(true);
    expect(result.more.every(item => item.fit !== null && item.fit >= FIT_GATE)).toBe(true);
    expect(result.results.length + result.more.length).toBe(
      result.intent.retrieval.fusedCandidates
    );
  });
});
