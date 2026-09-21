import { beforeEach, describe, expect, it } from 'vitest';
import type { SystemOneRequest, SystemOneResult, Answer } from '@/lib/jev/types';
import { resetPipelineState, runSemanticSearch, type JudgeFn } from '@/lib/search/pipeline';
import type { SearchDoc } from '@/lib/search/types';

function makeDoc(id: string, title: string, reason: string): SearchDoc {
  return {
    id,
    sourceId: '2026-06',
    book: {
      id,
      month: '2026-06',
      title,
      author: '某作者',
      publisher: '某出版社',
      pubYear: '2020',
      pages: '200',
      rating: '8.2',
      callNumber: 'B842.6',
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
      subjects: 'B842.6',
      reason,
      summary: `${title} 的内容简介`,
      toc: ''
    },
    exact: { isbn: `isbn-${id}`, barcode: id, callNumber: 'B842.6' },
    numeric: { rating: 8.2, pubYear: 2020, pages: 200 },
    hash: id
  };
}

const corpus: SearchDoc[] = [
  makeDoc('d1', '焦虑的意义', '存在主义心理学专著'),
  makeDoc('d2', '焦虑与自由', '哲学随笔'),
  makeDoc('d3', '生活的焦虑', '日常心理'),
  makeDoc('d4', '焦虑时代', '社会学观察')
];

const noul = (value: number): Answer => ({ type: 'noul', noul: value });
const choice = (
  probabilities: Record<string, number>,
  chosen: string,
  confidence = 0.8
): Answer => ({ type: 'choice', choice: chosen, probabilities, confidence });

interface StubOptions {
  understand?: 'ok' | 'fail';
  /** 返回每本候选的 fit；'fail' 表示整批失败 */
  rerank?: 'ok' | 'fail' | ((index: number) => number);
  pNone?: number;
  bestProbabilities?: (index: number) => number;
  needsWiderRecall?: number;
  widePick?: 'none' | 'top';
}

function makeJudge(options: StubOptions = {}) {
  const calls: SystemOneRequest[] = [];
  const judge: JudgeFn = async (request): Promise<SystemOneResult> => {
    calls.push(request);
    const keys = Object.keys(request.questions);
    const answers: Record<string, Answer> = {};

    if (keys.includes('intent')) {
      if (options.understand === 'fail') throw new Error('understand failed');
      answers.intent = choice(
        { concept: 0.8, work: 0.05, similar: 0.05, list: 0.05, other: 0.05 },
        'concept'
      );
      answers.needs_wider_recall = noul(options.needsWiderRecall ?? 0.2);
      answers.wants_fiction = noul(0.4);
      answers.wants_recent = noul(0.4);
      answers.avoid_theory = noul(0.4);
      answers.wants_verified = noul(0.6);
    } else if (keys.includes('pick')) {
      const shard = (request.state as { shard: { id: string }[] }).shard;
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
      answers.batch_has_match = noul(0.9);
      candidates.forEach((item, index) => {
        const fitFn = typeof options.rerank === 'function' ? options.rerank : () => 0.8;
        answers[`fits::${item.id}`] = noul(fitFn(index));
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
    // more = 通过门控的溢出项 + 未通过门控的 rejected
    expect(result.more.length).toBeGreaterThan(0);
    expect(result.more.some(item => item.passedGate === false)).toBe(true);
    const pcts = result.more.map(item => item.relevancePct);
    expect([...pcts].sort((a, b) => b - a)).toEqual(pcts);

    // 「加载更多」不新增 Jev 请求：fast 仍是 1× understand + 1× rerank
    expect(calls.filter(call => 'intent' in call.questions)).toHaveLength(1);
    expect(calls.filter(call => 'best' in call.questions)).toHaveLength(1);
  });
});
