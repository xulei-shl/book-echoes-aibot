import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FIT_LEVELS } from '@/lib/search/levels';
import { FIT_GATE } from '@/lib/search/tuning';
import { runSemanticSearch } from '@/lib/search/pipeline';
import { resetPipelineState } from '@/lib/search/judge-cache';
import type { SystemOneRequest } from '@/lib/jev/types';
import type { SearchDoc } from '@/lib/search/types';
import { corpus, makeDoc, makeJudge } from './pipeline-fixtures';

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
    // 索书号在**构造时**就给成 I 类：`clc` 是构造期算好的派生字段，
    // 事后改写 callNumber 而不重算 clc 会让语料自相矛盾
    const fictionCorpus: SearchDoc[] = [
      makeDoc('f1', '焦虑的旅程', '小说', { callNumber: 'I247.5' }),
      makeDoc('f2', '焦虑的旅程', '小说', { callNumber: 'I247.5' })
    ];
    const result = await runSemanticSearch(
      { query: '不要小说，焦虑的书' },
      { judge, corpus: fictionCorpus, vectors: null }
    );
    // 语料全部是 I 类虚构书：候选被硬条件清空 → 弃权而非硬凑
    expect(result.abstained).toBe(true);
    expect(result.abstainReason).toBe('hard-filter');
    expect(result.results).toEqual([]);
  });

  it('filters.callClasses 按中图法类号过滤，并记入 plan.applied', async () => {
    const { judge } = makeJudge({ rerank: () => 0.9, pNone: 0.05 });
    const mixedCorpus: SearchDoc[] = [
      makeDoc('k1', '焦虑的历史', '传记', { callNumber: 'K835.615.6' }),
      makeDoc('b1', '焦虑的哲学', '哲学', { callNumber: 'B842.6' })
    ];
    const result = await runSemanticSearch(
      { query: '焦虑', filters: { callClasses: ['K'] } },
      { judge, corpus: mixedCorpus, vectors: null }
    );

    expect(result.results.map(item => item.book.id)).toEqual(['k1']);
    expect(result.intent.plan.applied).toContainEqual({
      field: 'callClasses',
      value: ['K'],
      source: 'api'
    });
    // 条件型查询：批级否定不会把确定满足条件的书藏起来
    expect(result.abstained).toBe(false);
  });

  it('类目条件把候选全部滤掉时诚实弃权（hard-filter），不烧一次精排', async () => {
    const { judge, calls } = makeJudge({ rerank: () => 0.9, pNone: 0.05 });
    const corpusWithoutZ: SearchDoc[] = [
      makeDoc('k1', '焦虑的历史', '传记', { callNumber: 'K835.615.6' })
    ];
    const result = await runSemanticSearch(
      { query: '焦虑', filters: { callClasses: ['Z'] } },
      { judge, corpus: corpusWithoutZ, vectors: null }
    );

    expect(result.abstained).toBe(true);
    expect(result.abstainReason).toBe('hard-filter');
    expect(result.results).toEqual([]);
    // 只发出过 understand，精排从未跑（硬条件在召回阶段就筛空了）
    expect(calls.filter(call => Object.keys(call.questions).includes('best'))).toHaveLength(0);
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

describe('模型类目条件（独立请求 + 两级两题）', () => {
  const classCorpus: SearchDoc[] = [
    makeDoc('c1', '焦虑的意义', '存在主义心理学专著', { callNumber: 'B842.6' }),
    // 词面弱命中（仅初评理由里出现）：不这样就直接落到 lane 之外，测不到「类目生效后的结果」
    makeDoc('c2', '中国地理纲要', '中国自然地理专著，兼论焦虑的分布', { callNumber: 'K928.42' }),
    // C913.9 社会生活是 C91 社会学下的三级，二级粒度上归入 C91
    makeDoc('c3', '焦虑时代', '社会学观察', { callNumber: 'C913.9' })
  ];

  it('模型给出类目只作为软先验：不删结果，类号记入 plan.dropped（soft）', async () => {
    // l1 = C 社会科学总论，l2 = C91 社会学：两级同源 → 取更具体的二级
    const { judge } = makeJudge({
      rerank: () => 0.9,
      pNone: 0.05,
      classL1: 'C',
      classL2: 'C91'
    });
    const result = await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus: classCorpus, vectors: null }
    );
    // 类目不再升级成硬过滤：只进 dropped，由本地软先验加分
    expect(result.intent.plan.applied).toEqual([]);
    expect(result.intent.plan.dropped).toEqual([
      { field: 'callClasses', value: ['C91'], reason: 'soft' }
    ]);
    // 类号不同的书不再被删除 —— 这正是语义检索相对单桶过滤的增量
    expect(result.results.map(item => item.book.id).sort()).toEqual(['c1', 'c2', 'c3']);
  });

  it('两级不一致时退回较粗的 l1（宁可不过滤，也不误删）', async () => {
    // l1 = K 历史地理，但 l2 却指到 B84 心理学 —— 模型自相矛盾 = 不确定
    const { judge } = makeJudge({
      rerank: () => 0.9,
      pNone: 0.05,
      classL1: 'K',
      classL2: 'B84'
    });
    const result = await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus: classCorpus, vectors: null }
    );
    expect(result.intent.plan.applied).toEqual([]);
    expect(result.intent.plan.dropped).toEqual([
      { field: 'callClasses', value: ['K'], reason: 'soft' }
    ]);
    expect(result.results.length).toBe(3);
  });

  it('一级答「不是在按类目筛」时整条类目条件都不用（二级答案不单独采信）', async () => {
    // 只给二级、一级留空：二级多半是照着主题词猜的，采信它会误删
    const { judge } = makeJudge({ rerank: () => 0.9, pNone: 0.05, classL2: 'C91' });
    const result = await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus: classCorpus, vectors: null }
    );
    expect(result.intent.plan.applied).toEqual([]);
    expect(result.intent.plan.dropped).toEqual([]);
    expect(result.results.length).toBeGreaterThan(1);
  });

  it('一级给了大类、二级答「没有更具体的」时用 l1（同样只做软先验）', async () => {
    const { judge } = makeJudge({ rerank: () => 0.9, pNone: 0.05, classL1: 'K' });
    const result = await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus: classCorpus, vectors: null }
    );
    expect(result.intent.plan.applied).toEqual([]);
    expect(result.intent.plan.dropped).toEqual([
      { field: 'callClasses', value: ['K'], reason: 'soft' }
    ]);
    expect(result.results.length).toBe(3);
  });

  it('答 __none__ 时不设任何类目条件（默认档）', async () => {
    const { judge } = makeJudge({ rerank: () => 0.9, pNone: 0.05 });
    const result = await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus: classCorpus, vectors: null }
    );
    expect(result.intent.plan.applied).toEqual([]);
    expect(result.intent.plan.dropped).toEqual([]);
    // 词法命中两本，类目条件缺席时都不该被删
    expect(result.results.length).toBeGreaterThan(1);
  });

  it('同一句 query 在不同语料间不复用类目缓存（c0..cN 只对那一份选项表有意义）', async () => {
    const otherCorpus: SearchDoc[] = [
      makeDoc('g1', '中国地理纲要', '中国自然地理专著', { callNumber: 'K928.42' }),
      makeDoc('g2', '中国历史地理', '历史地理专著', { callNumber: 'K928.42' })
    ];

    const first = await runSemanticSearch(
      { query: '焦虑' },
      {
        judge: makeJudge({ rerank: () => 0.9, pNone: 0.05, classL1: 'C', classL2: 'C91' })
          .judge,
        corpus: classCorpus,
        vectors: null
      }
    );
    // 故意不清缓存：这一跑若能命中上一份语料的结论，就会拿别的语料的 cN 当类号用
    const second = await runSemanticSearch(
      { query: '焦虑' },
      {
        judge: makeJudge({ rerank: () => 0.9, pNone: 0.05, classL1: 'K', classL2: 'K92' })
          .judge,
        corpus: otherCorpus,
        vectors: null
      }
    );

    expect(first.intent.plan.dropped).toEqual([
      { field: 'callClasses', value: ['C91'], reason: 'soft' }
    ]);
    expect(second.intent.plan.dropped).toEqual([
      { field: 'callClasses', value: ['K92'], reason: 'soft' }
    ]);
  });

  it('句中有否定表达时不执行模型类目，记 negated', async () => {
    const { judge } = makeJudge({
      rerank: () => 0.9,
      pNone: 0.05,
      classL1: 'C',
      classL2: 'C91',
      // 否定信号取**类目请求自己的**那一题：两边独立，互不牵连
      classNegation: 0.9
    });
    const result = await runSemanticSearch(
      { query: '不要社会学方面的焦虑书' },
      { judge, corpus: classCorpus, vectors: null }
    );
    expect(result.intent.plan.applied).toEqual([]);
    expect(result.intent.plan.dropped).toEqual([
      { field: 'callClasses', value: ['C91'], reason: 'negated' }
    ]);
    expect(result.results.map(item => item.book.id)).toContain('c1');
  });

  it('调用方已显式传类目时字面证据优先，模型类目记 rule-conflict', async () => {
    const { judge } = makeJudge({
      rerank: () => 0.9,
      pNone: 0.05,
      classL1: 'C',
      classL2: 'C91'
    });
    const result = await runSemanticSearch(
      { query: '焦虑', filters: { callClasses: ['B84'] } },
      { judge, corpus: classCorpus, vectors: null }
    );
    expect(result.intent.plan.applied).toEqual([
      { field: 'callClasses', value: ['B84'], source: 'api' }
    ]);
    expect(result.intent.plan.dropped).toEqual([
      { field: 'callClasses', value: ['C91'], reason: 'rule-conflict' }
    ]);
    expect(result.results.map(item => item.book.id)).toEqual(['c1']);
  });

  it('模型类目选择性极高也不再滤空候选（降级为软先验的核心收益）', async () => {
    // 200 本 B842.6 + 唯一一本 K92。类目硬过滤时两路 lane 的前 N 名里几乎全是 B 类，
    // 融合后过滤会得到空候选 → 旧实现要跑第二段补召回；现在类目只是软先验，压根不删结果。
    const sparse: SearchDoc[] = [];
    for (let i = 0; i < 200; i += 1) {
      sparse.push(makeDoc(`h${i}`, `焦虑研究${i}`, '焦虑主题专著', { callNumber: 'B842.6' }));
    }
    sparse.push(
      makeDoc('geo', '中国地理纲要', '中国自然地理专著，兼论焦虑的分布', { callNumber: 'K928.42' })
    );

    const { judge, calls } = makeJudge({
      rerank: () => 0.9,
      pNone: 0.05,
      classL1: 'K',
      classL2: 'K92'
    });
    const result = await runSemanticSearch(
      { query: '焦虑', limit: 10 },
      { judge, corpus: sparse, vectors: null }
    );

    expect(result.intent.plan.applied).toEqual([]);
    expect(result.intent.plan.dropped).toEqual([
      { field: 'callClasses', value: ['K92'], reason: 'soft' }
    ]);
    expect(result.abstained).toBe(false);
    expect(result.results.length).toBeGreaterThan(1);
    // 类目不再触发补召回：一次意图 + 一次类目 + 一次精排
    expect(calls.filter(call => 'intent' in call.questions)).toHaveLength(1);
    expect(calls.filter(call => 'best' in call.questions)).toHaveLength(1);
  });

  it('模型推出的年份下限（非类目）同样享受两段式补召回', async () => {
    // 与上一条同构，但条件是**年份**：模型把「近两年」升级成 pubYearFrom=2020，
    // 确定性层没有同名条件 —— 它同样赶不上下推。只让类目享受补救是不对称的。
    const old: SearchDoc[] = [];
    for (let i = 0; i < 200; i += 1) {
      old.push(makeDoc(`o${i}`, `焦虑研究${i}`, '焦虑主题专著', { pubYear: 2010 }));
    }
    // 唯一一本 2021 年出版的书：只在简介里弱命中，词法名次落在 lane 窗口之外
    old.push(makeDoc('recent', '新解', '本书讨论了焦虑', { pubYear: 2021 }));

    const { judge } = makeJudge({
      rerank: () => 0.9,
      pNone: 0.05,
      yearFloor: 4, // = 2020 以后
      strictness: 0.9
    });
    const result = await runSemanticSearch(
      { query: '焦虑', limit: 10 },
      { judge, corpus: old, vectors: null }
    );

    expect(result.intent.plan.applied).toEqual([
      { field: 'pubYearFrom', value: 2020, source: 'model' }
    ]);
    // 第一轮候选全是 2010 年的书、被模型条件滤空 → 补召回后 2021 那本必须回来
    expect(result.results.map(item => item.book.id)).toEqual(['recent']);
    expect(result.abstained).toBe(false);
  });

  it('两次调用各自计时，响应里看得到类目请求的真实代价', async () => {
    const { judge } = makeJudge({ rerank: () => 0.9, pNone: 0.05, classL1: 'C', classL2: 'C91' });
    const result = await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus: classCorpus, vectors: null }
    );
    expect(result.timing.classMs).toBeGreaterThanOrEqual(0);
    expect(result.timing.understandMs).toBeGreaterThanOrEqual(0);
  });
});

describe('虚构维度的模型侧硬过滤', () => {
  const genreCorpus: SearchDoc[] = [
    makeDoc('f1', '焦虑小说', '文学虚构作品', { callNumber: 'I247.5' }),
    makeDoc('n1', '焦虑的意义', '存在主义心理学专著', { callNumber: 'B842.6' })
  ];

  it('nonfiction + strictness 高 → 升级成硬排除', async () => {
    const { judge } = makeJudge({
      rerank: () => 0.9,
      pNone: 0.05,
      genre: 'nonfiction',
      strictness: 0.9
    });
    const result = await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus: genreCorpus, vectors: null }
    );
    expect(result.intent.plan.applied).toEqual([
      { field: 'excludeFiction', value: true, source: 'model' }
    ]);
    expect(result.results.map(item => item.book.id)).toEqual(['n1']);
  });

  it('strictness 低 → 只当倾向，记 soft（与年份/评分同一套门）', async () => {
    const { judge } = makeJudge({
      rerank: () => 0.9,
      pNone: 0.05,
      genre: 'nonfiction',
      strictness: 0.1
    });
    const result = await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus: genreCorpus, vectors: null }
    );
    expect(result.intent.plan.applied).toEqual([]);
    expect(result.intent.plan.dropped).toEqual([
      { field: 'excludeFiction', value: true, reason: 'soft' }
    ]);
    // 软信号照旧生效（facets 里 wantsFiction = 0），只是不删任何书
    expect(result.intent.facets.wantsFiction).toBe(0);
    expect(result.results.length).toBe(2);
  });

  it('句中否定不拦下虚构条件，却照旧拦下年份 —— 两者刻意相反', async () => {
    const { judge } = makeJudge({
      rerank: () => 0.9,
      pNone: 0.05,
      genre: 'nonfiction',
      strictness: 0.9,
      negation: 0.9,
      yearFloor: 4 // = 2020 年以后，应被否定门拦下
    });
    const result = await runSemanticSearch(
      // 「别推…小说」不在规则层的 `不要(小说|虚构|文学|故事)` 里 —— 只有模型侧能读到
      { query: '别推焦虑小说，来点正经的' },
      { judge, corpus: genreCorpus, vectors: null }
    );
    // 否定是**构成**「排除虚构」的表达，不是要反向执行它 → 照常生效
    expect(result.intent.plan.applied).toEqual([
      { field: 'excludeFiction', value: true, source: 'model' }
    ]);
    // 而年份是下限语义，句中否定必须拦下（否则会反向成「只要 2020 年后」）
    expect(result.intent.plan.dropped).toEqual([
      { field: 'pubYearFrom', value: 2020, reason: 'negated' }
    ]);
    expect(result.results.map(item => item.book.id)).toEqual(['n1']);
  });

  it('规则层已从字面认出虚构条件时让位，记 rule-conflict', async () => {
    // 「不要小说」命中 `EXCLUDE_FICTION_PATTERN`，字面证据优先
    const { judge } = makeJudge({
      rerank: () => 0.9,
      pNone: 0.05,
      genre: 'nonfiction',
      strictness: 0.9
    });
    const result = await runSemanticSearch(
      { query: '不要小说的焦虑书' },
      { judge, corpus: genreCorpus, vectors: null }
    );
    expect(result.intent.plan.applied).toEqual([
      { field: 'excludeFiction', value: true, source: 'rule' }
    ]);
    expect(result.intent.plan.dropped).toEqual([
      { field: 'excludeFiction', value: true, reason: 'rule-conflict' }
    ]);
  });

  it('genre = fiction 不产生硬条件（「只要虚构」由 `callClasses: [I]` 表达）', async () => {
    const { judge } = makeJudge({
      rerank: () => 0.9,
      pNone: 0.05,
      genre: 'fiction',
      strictness: 0.9
    });
    const result = await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus: genreCorpus, vectors: null }
    );
    expect(result.intent.plan.applied).toEqual([]);
    expect(result.intent.plan.dropped).toEqual([]);
    expect(result.results.length).toBe(2);
  });

  it('调用方已显式传 excludeFiction 时让位，记 rule-conflict', async () => {
    const { judge } = makeJudge({
      rerank: () => 0.9,
      pNone: 0.05,
      genre: 'nonfiction',
      strictness: 0.9
    });
    const result = await runSemanticSearch(
      { query: '焦虑', filters: { excludeFiction: true } },
      { judge, corpus: genreCorpus, vectors: null }
    );
    expect(result.intent.plan.applied).toEqual([
      { field: 'excludeFiction', value: true, source: 'api' }
    ]);
    expect(result.intent.plan.dropped).toEqual([
      { field: 'excludeFiction', value: true, reason: 'rule-conflict' }
    ]);
  });
});

describe('模型被告知的筛选上下文（wide / 精排）', () => {
  // 两本都满足「K92 + 评分≥8 + 2020 年后」，保证有候选进精排
  const rerankCorpus: SearchDoc[] = [
    makeDoc('r1', '焦虑中国地理', '中国自然地理专著', {
      callNumber: 'K928.42',
      pubYear: 2024,
      rating: 8.5
    }),
    makeDoc('r2', '焦虑中国地理续', '中国自然地理专著二', {
      callNumber: 'K928.701',
      pubYear: 2024,
      rating: 8.5
    })
  ];

  const rerankRequestOf = (calls: SystemOneRequest[]): SystemOneRequest => {
    const found = calls.find(call => Object.keys(call.questions).includes('best'));
    expect(found).toBeDefined();
    return found!;
  };
  const stateOf = (request: SystemOneRequest) =>
    request.state as { enforced: string[]; candidates: { clc: string | null }[] };

  it('state.enforced 把已生效的硬条件讲清楚，且类目带类目名', async () => {
    const { judge, calls } = makeJudge({ rerank: () => 0.9, pNone: 0.05 });
    await runSemanticSearch(
      { query: '焦虑的书', filters: { minRating: 8, pubYearFrom: 2020, callClasses: ['K92'] } },
      { judge, corpus: rerankCorpus, vectors: null }
    );

    const state = stateOf(rerankRequestOf(calls));
    expect(state.enforced).toEqual([
      '评分 ≥ 8',
      '出版年 ≥ 2020',
      '中图法类目属于 K92 中国地理'
    ]);
    // 题面必须引用 enforced，否则告知了也没用
    expect(String(rerankRequestOf(calls).questions.best.instructions)).toContain('enforced');
  });

  it('没有硬条件时 enforced 是空数组（而不是缺字段）', async () => {
    const { judge, calls } = makeJudge({ rerank: () => 0.9, pNone: 0.05 });
    await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus: rerankCorpus, vectors: null }
    );
    expect(stateOf(rerankRequestOf(calls)).enforced).toEqual([]);
  });

  it('候选带上中图法类目名，不再是认不出学科的裸索书号', async () => {
    const { judge, calls } = makeJudge({ rerank: () => 0.9, pNone: 0.05 });
    await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus: rerankCorpus, vectors: null }
    );
    const labels = stateOf(rerankRequestOf(calls)).candidates.map(candidate => candidate.clc);
    expect(labels).toEqual(['K92 中国地理', 'K92 中国地理']);
  });

  it('wide 分片同样带上 enforced 与类目名（deep 模式）', async () => {
    process.env.SEMANTIC_SEARCH_WIDE_SHARD = '2'; // 4 本 → 2 片
    const { judge, calls } = makeJudge({
      needsWiderRecall: 1,
      widePick: 'top',
      rerank: () => 0.9,
      pNone: 0.05
    });
    await runSemanticSearch(
      // corpus 全是 B842.6；允许集合由**确定性**条件算出，wide 就在这批书里分片
      { query: '焦虑', mode: 'deep', filters: { callClasses: ['B84'] } },
      { judge, corpus, vectors: null }
    );

    const wideCall = calls.find(call => Object.keys(call.questions).includes('pick'));
    expect(wideCall).toBeDefined();
    const state = wideCall!.state as { enforced: string[]; shard: { clc: string | null }[] };
    expect(state.enforced).toEqual(['中图法类目属于 B84 心理学']);
    expect(state.shard.every(item => item.clc === 'B84 心理学')).toBe(true);
    // 题面必须引用 enforced，否则告知了也没用
    expect(String(wideCall!.questions.pick.instructions)).toContain('enforced');
  });
});

describe('两次 Jev 调用的失败隔离', () => {
  const corpusWithYears: SearchDoc[] = [
    makeDoc('n1', '焦虑的意义', '存在主义心理学专著', { pubYear: 2024, rating: 8.5, callNumber: 'B842.6' }),
    makeDoc('n2', '中国地理纲要', '中国自然地理专著，兼论焦虑的分布', {
      pubYear: 2024,
      rating: 8.5,
      callNumber: 'K928.42'
    })
  ];

  it('类目请求失败：只丢类目条件，年份/评分档位与 facets 照常生效', async () => {
    const { judge } = makeJudge({
      rerank: () => 0.9,
      pNone: 0.05,
      class: 'fail',
      yearFloor: 4, // = 2020 年以后
      ratingFloor: 2, // = 8 分以上
      strictness: 0.9 // 档位条件要真升成硬过滤，才能证明它没被类目请求拖累
    });
    const result = await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus: corpusWithYears, vectors: null }
    );

    // 类目丢了，且有可见记录（绝不静默伪装成正常结果）
    expect(result.degraded).toContain('understand-class');
    expect(result.degraded).not.toContain('understand');
    expect(result.intent.plan.applied.some(entry => entry.field === 'callClasses')).toBe(false);

    // 意图请求完全没受影响：档位条件照旧升级成硬过滤
    expect(result.intent.plan.applied).toEqual([
      { field: 'pubYearFrom', value: 2020, source: 'model' },
      { field: 'minRating', value: 8, source: 'model' }
    ]);
    expect(result.intent.type).toBe('concept');
  });

  it('意图请求失败：类目结论仍然可用，不再被连带作废', async () => {
    const { judge } = makeJudge({
      rerank: () => 0.9,
      pNone: 0.05,
      understand: 'fail',
      classL1: 'K',
      classL2: 'K92'
    });
    const result = await runSemanticSearch(
      { query: '焦虑' },
      { judge, corpus: corpusWithYears, vectors: null }
    );

    expect(result.degraded).toContain('understand');
    expect(result.degraded).not.toContain('understand-class');
    // 拆成两次调用的直接收益：这边挂了不影响那边 —— 类目结论仍可用，只是作为软先验
    expect(result.intent.plan.dropped).toEqual([
      { field: 'callClasses', value: ['K92'], reason: 'soft' }
    ]);
    expect(result.results.length).toBe(2);
  });
});
