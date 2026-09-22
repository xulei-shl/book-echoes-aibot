import { describe, expect, it } from 'vitest';
import { buildIndex, search } from '@/lib/search/bm25';
import { resolveClc } from '@/lib/search/clc';
import { cosineTopK, type VectorIndex } from '@/lib/search/dense';
import { applyFilters, buildAllowSet, compileDocFilter } from '@/lib/search/recall';
import type { RecallResult, SearchDoc, SearchFields } from '@/lib/search/types';

/**
 * 硬条件过滤的回归测试。
 *
 * 两件事必须守住：
 * 1. **判定唯一**：下推（`buildAllowSet`）与融合后兜底（`applyFilters`）必须是同一份判定；
 * 2. **下推发生在截断之前**：否则严筛选会把 lane 的前 N 名滤空，把「有书」误报成「没有」。
 */

function makeDoc(
  id: string,
  options: {
    callNumber?: string;
    rating?: number;
    pubYear?: number;
    fields?: Partial<SearchFields>;
  } = {}
): SearchDoc {
  const callNumber = options.callNumber ?? '';
  return {
    id,
    sourceId: '2026-06',
    book: {
      id,
      month: '2026-06',
      title: id,
      author: '某作者',
      publisher: '某出版社',
      pubYear: String(options.pubYear ?? 2020),
      pages: '200',
      rating: String(options.rating ?? 8),
      callNumber,
      callNumberLink: '',
      isbn: `isbn-${id}`,
      recommendation: '',
      summary: '',
      authorIntro: '',
      catalog: '',
      coverUrl: ''
    },
    fields: {
      title: id,
      subtitle: '',
      author: '',
      translator: '',
      publisher: '',
      subjects: callNumber,
      reason: '',
      summary: '',
      toc: '',
      ...options.fields
    },
    exact: { isbn: `isbn-${id}`, barcode: id, callNumber },
    clc: resolveClc(callNumber),
    numeric: { rating: options.rating ?? 8, pubYear: options.pubYear ?? 2020, pages: 200 },
    hash: id
  };
}

const recallResult = (docId: string): RecallResult => ({
  docId,
  score: 1,
  lanes: ['lexical'],
  matched: [],
  laneScores: {}
});

describe('recall / compileDocFilter', () => {
  it('没有任何条件时返回 null（调用方据此走零开销直通路径）', () => {
    expect(compileDocFilter()).toBeNull();
    expect(compileDocFilter({})).toBeNull();
    expect(compileDocFilter({ callClasses: [] })).toBeNull();
    expect(compileDocFilter({ excludeFiction: false })).toBeNull();
  });

  it('出版年未知（0）的书不被年份条件误删', () => {
    const passes = compileDocFilter({ pubYearFrom: 2020 })!;
    expect(passes(makeDoc('known', { pubYear: 2019 }))).toBe(false);
    expect(passes(makeDoc('recent', { pubYear: 2024 }))).toBe(true);
    expect(passes(makeDoc('unknown', { pubYear: 0 }))).toBe(true);
  });

  it('评分未知（0）的书不被评分条件误删 —— 与出版年同一套豁免', () => {
    const passes = compileDocFilter({ minRating: 7.5 })!;
    expect(passes(makeDoc('low', { rating: 6 }))).toBe(false);
    expect(passes(makeDoc('boundary', { rating: 7.5 }))).toBe(true);
    expect(passes(makeDoc('ok', { rating: 8.5 }))).toBe(true);
    expect(passes(makeDoc('unknown', { rating: 0 }))).toBe(true);
  });

  it('新书尚未有评分时不被「年份 + 评分」组合条件静默删掉', () => {
    // 实测：2025 年后出版的 270 本里有 95 本还没有豆瓣评分。
    // 没有豁免时「2025 年以后 + 7.5 分以上」会把它们一并删掉，而用户只是想要新书。
    const passes = compileDocFilter({ pubYearFrom: 2025, minRating: 7.5 })!;
    expect(passes(makeDoc('new-unrated', { pubYear: 2026, rating: 0 }))).toBe(true);
    expect(passes(makeDoc('new-low', { pubYear: 2026, rating: 7 }))).toBe(false);
    expect(passes(makeDoc('new-ok', { pubYear: 2026, rating: 8 }))).toBe(true);
    // 年份条件对未知年份的豁免仍然独立生效，两者不互相干扰
    expect(passes(makeDoc('old-unrated', { pubYear: 2020, rating: 0 }))).toBe(false);
    expect(passes(makeDoc('unknown-year-unrated', { pubYear: 0, rating: 0 }))).toBe(true);
  });

  it('类目按一级 / 二级 / T 类三级任一粒度命中', () => {
    const biography = makeDoc('bio', { callNumber: 'K835.615.6' });
    const psychology = makeDoc('psy', { callNumber: 'B842.6' });
    const program = makeDoc('prog', { callNumber: 'TP311.5' });

    expect(compileDocFilter({ callClasses: ['K'] })!(biography)).toBe(true);
    expect(compileDocFilter({ callClasses: ['K83'] })!(biography)).toBe(true);
    expect(compileDocFilter({ callClasses: ['K81'] })!(biography)).toBe(false);
    expect(compileDocFilter({ callClasses: ['K'] })!(psychology)).toBe(false);
    expect(compileDocFilter({ callClasses: ['B84', 'TP3'] })!(psychology)).toBe(true);
    expect(compileDocFilter({ callClasses: ['B84', 'TP3'] })!(program)).toBe(true);
    expect(compileDocFilter({ callClasses: ['ts'] })!(program)).toBe(false);
  });

  it('多个条件之间是「与」', () => {
    const passes = compileDocFilter({ pubYearFrom: 2020, minRating: 8, callClasses: ['K'] })!;
    expect(passes(makeDoc('ok', { callNumber: 'K2', pubYear: 2021, rating: 8.5 }))).toBe(true);
    expect(passes(makeDoc('old', { callNumber: 'K2', pubYear: 2010, rating: 8.5 }))).toBe(false);
    expect(passes(makeDoc('low', { callNumber: 'K2', pubYear: 2021, rating: 6 }))).toBe(false);
    expect(passes(makeDoc('other', { callNumber: 'I247.5', pubYear: 2021, rating: 8.5 }))).toBe(false);
  });

  it('纯文学与理论性的判定共用 clc（软偏好不会与硬过滤分叉）', () => {
    expect(compileDocFilter({ excludeFiction: true })!(makeDoc('f', { callNumber: 'I247.5' }))).toBe(false);
    expect(compileDocFilter({ excludeFiction: true })!(makeDoc('n', { callNumber: 'K2' }))).toBe(true);
  });
});

describe('recall / buildAllowSet', () => {
  const corpus = [
    makeDoc('k1', { callNumber: 'K835.615.6', pubYear: 2024 }),
    makeDoc('k2', { callNumber: 'K2', pubYear: 2010 }),
    makeDoc('b1', { callNumber: 'B842.6', pubYear: 2024 })
  ];

  it('无硬条件时返回 null，不建集合', () => {
    expect(buildAllowSet(corpus)).toBeNull();
    expect(buildAllowSet(corpus, {})).toBeNull();
  });

  it('只收满足全部条件的书', () => {
    expect([...buildAllowSet(corpus, { callClasses: ['K'] })!].sort()).toEqual(['k1', 'k2']);
    expect([...buildAllowSet(corpus, { callClasses: ['K'], pubYearFrom: 2020 })!]).toEqual(['k1']);
  });

  it('全部滤空时返回空集合（不是 null）—— 调用方据此诚实弃权', () => {
    const allow = buildAllowSet(corpus, { callClasses: ['Z'] });
    expect(allow).not.toBeNull();
    expect(allow!.size).toBe(0);
  });
});

describe('recall / applyFilters', () => {
  const docs = new Map([
    ['k1', makeDoc('k1', { callNumber: 'K835.615.6' })],
    ['b1', makeDoc('b1', { callNumber: 'B842.6' })]
  ]);

  it('无硬条件时原样返回（浅层直通，不复制数组）', () => {
    const results = [recallResult('k1'), recallResult('b1')];
    expect(applyFilters(results, docs)).toBe(results);
  });

  it('类目过滤在下推与兜底两处给出同一答案', () => {
    const results = [recallResult('k1'), recallResult('b1')];
    const kept = applyFilters(results, docs, { callClasses: ['K'] });
    expect(kept.map(result => result.docId)).toEqual(['k1']);
    // 与下推集合一致：不存在「先过滤留下、后过滤删掉」的分叉
    const allow = buildAllowSet([...docs.values()], { callClasses: ['K'] })!;
    expect(kept.every(result => allow.has(result.docId))).toBe(true);
  });

  it('引用了语料外的 docId 时剔除（不静默保留）', () => {
    expect(applyFilters([recallResult('missing')], docs, { callClasses: ['K'] })).toEqual([]);
  });
});

/**
 * **最关键的一条回归**：硬条件必须在 lane 取 top-K **之前**生效。
 *
 * 反例（改造前的行为）：lane 先截断出前 2 名，再按硬条件过滤 —— 目标书虽然满足条件，
 * 却因为排名靠后被截掉，融合后候选为空，用户看到「馆藏里没有」。
 */
describe('recall / 硬条件下推必须早于 top-K 截断', () => {
  // 高词频 + 短正文 → 排前面；目标书词频 1 + 长正文 → 排最后
  const filler = '甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥'.repeat(20);
  const docs = [
    ...['a', 'b', 'c', 'd'].map(id =>
      makeDoc(id, { callNumber: 'I247.5', fields: { title: '焦虑焦虑焦虑焦虑焦虑' } })
    ),
    makeDoc('target', { callNumber: 'K835.615.6', fields: { title: '焦虑', summary: filler } })
  ];

  it('目标书满足条件但排在 top-K 之外', () => {
    const index = buildIndex(docs);
    const truncated = search(index, ['焦虑'], 2);
    expect(truncated.map(item => item.docId)).not.toContain('target');

    // 这就是「先截断再过滤」的失败形态：目标书被截掉了，过滤后什么都不剩
    const postFiltered = truncated.filter(item => item.docId === 'target');
    expect(postFiltered).toEqual([]);

    // 下推之后：过滤发生在截断之前，目标书被正常召回
    const pushed = search(index, ['焦虑'], 2, new Set(['target']));
    expect(pushed.map(item => item.docId)).toEqual(['target']);
  });

  it('允许集合为空时 lane 直接返回空（快速失败，不做无用排序）', () => {
    const index = buildIndex(docs);
    expect(search(index, ['焦虑'], 2, new Set())).toEqual([]);
  });

  it('稠密 lane 整行跳过不在允许集合内的书', () => {
    const index: VectorIndex = {
      ids: ['a', 'b', 'c'],
      sourceIds: ['s', 's', 's'],
      hashes: ['h', 'h', 'h'],
      dim: 2,
      model: 'stub',
      count: 3,
      // a 与查询最相似，其次是 c
      vectors: new Float32Array([1, 0, 0, 1, 0.6, 0.8])
    };
    const query = new Float32Array([1, 0]);

    expect(cosineTopK(index, query, 3).map(item => item.docId)).toEqual(['a', 'c', 'b']);
    // 过滤掉 a 之后，top-1 落在 c —— 过滤确实发生在截断之前
    expect(cosineTopK(index, query, 1, new Set(['b', 'c'])).map(item => item.docId)).toEqual(['c']);
    expect(cosineTopK(index, query, 3, new Set())).toEqual([]);
    expect(cosineTopK(index, query, 3, null).map(item => item.docId)).toEqual(['a', 'c', 'b']);
  });
});
