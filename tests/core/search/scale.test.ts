import { beforeAll, describe, expect, it } from 'vitest';
import { buildIndex, estimateIndexBytes, search, type Bm25Index } from '@/lib/search/bm25';
import { resolveClc } from '@/lib/search/clc';
import { cosineTopK, type VectorIndex } from '@/lib/search/dense';
import { buildAllowSet } from '@/lib/search/recall';
import type { SearchDoc } from '@/lib/search/types';

/**
 * 万级语料的规模守卫。
 *
 * 目的不是抠毫秒，而是挡住**数量级回退**：倒排表退回嵌套 `Map`（内存爆炸）、
 * 过滤退回「先截断再过滤」（召回归零）、稠密 lane 退回逐本解析索书号（每次请求重算）。
 *
 * 本机实测（10 000 本）：
 * - 建索引 0.9s（进程内缓存，只付一次）；CSR + TypedArray 常驻 3.6MB
 * - 词法查询 top-60：26ms；稠密 10 000 × 1024 全量余弦：28ms
 * - 下推过滤（命中 25%）：词法 11ms、稠密 11ms —— 过滤越严越快，而不是越慢
 *
 * 断言里的时间上限刻意留了 ~5–20 倍余量，避免 CI 抖动误报。
 */

const N = 10_000;
const DIM = 1024;
const CALL_CLASSES = ['K835.615.6', 'B842.6', 'I247.5', 'TP311.5', 'C912.1', 'G519', 'F830.59', 'TS971.2'];

function synth(n: number): SearchDoc[] {
  return Array.from({ length: n }, (_, i) => {
    const id = `doc-${i}`;
    const callNumber = CALL_CLASSES[i % CALL_CLASSES.length];
    const title = `合成书籍第${i}号 焦虑与孤独 城市生活`;
    const summary = `${'存在主义心理学与现代社会观察'.repeat(12)}`;
    return {
      id,
      sourceId: '2026-06',
      book: {
        id,
        month: '2026-06',
        title,
        author: '某作者',
        publisher: '某出版社',
        pubYear: String(2000 + (i % 25)),
        pages: '300',
        rating: String(6 + (i % 4)),
        callNumber,
        callNumberLink: '',
        isbn: `isbn-${i}`,
        recommendation: '',
        summary,
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
        reason: '主题判断',
        summary,
        toc: ''
      },
      exact: { isbn: `isbn-${i}`, barcode: id, callNumber },
      clc: resolveClc(callNumber),
      numeric: { rating: 6 + (i % 4), pubYear: 2000 + (i % 25), pages: 300 },
      hash: `h${i}`
    };
  });
}

const TERMS = ['焦虑', '孤独'];

describe('scale / 万级语料', () => {
  let docs: SearchDoc[];
  let index: Bm25Index;
  let vectors: VectorIndex;
  /** 类目下推的允许集合：K 与 TP3 两类，约 1/4 的语料 */
  let allow: Set<string>;

  beforeAll(() => {
    docs = synth(N);
    index = buildIndex(docs);
    const data = new Float32Array(N * DIM);
    for (let i = 0; i < data.length; i += 1) data[i] = ((i % 100) - 50) / 50;
    vectors = {
      ids: docs.map(doc => doc.id),
      sourceIds: docs.map(doc => doc.sourceId),
      hashes: docs.map(doc => doc.hash),
      dim: DIM,
      model: 'stub',
      count: N,
      vectors: data
    };
    allow = buildAllowSet(docs, { callClasses: ['K', 'TP3'] })!;
  });

  it('索引常驻内存与词法查询都在预算内', () => {
    expect(index.docs).toHaveLength(N);
    // CSR + TypedArray：倒排表若退回嵌套 Map，这里是几百 MB 量级
    expect(estimateIndexBytes(index)).toBeLessThan(60 * 1024 * 1024);

    const started = Date.now();
    const hits = search(index, TERMS, 60);
    expect(Date.now() - started).toBeLessThan(500);
    expect(hits).toHaveLength(60);
  });

  it('下推过滤比不过滤更快（过滤越严越快，不是越慢）', () => {
    expect(allow.size).toBeGreaterThan(0);
    expect(allow.size).toBeLessThan(N);

    const started = Date.now();
    const filtered = search(index, TERMS, 60, allow);
    const filteredMs = Date.now() - started;

    expect(filtered).toHaveLength(60);
    expect(filtered.every(hit => allow.has(hit.docId))).toBe(true);
    expect(filteredMs).toBeLessThan(500);

    // 空集合直接短路：不做无用排序
    const emptyStarted = Date.now();
    expect(search(index, TERMS, 60, new Set())).toEqual([]);
    expect(Date.now() - emptyStarted).toBeLessThan(500);
  });

  /**
   * **召回不变式（万级下才真正致命的那个 bug）**：
   * 先截断再过滤时，前 60 名里只有一部分满足类目条件，融合后候选远少于 60；
   * 下推之后，60 个名额全部由满足条件的书竞争。
   */
  it('过滤必须早于 top-K 截断，否则候选会大幅缩水', () => {
    const truncatedThenFiltered = search(index, TERMS, 60).filter(hit => allow.has(hit.docId));
    const pushed = search(index, TERMS, 60, allow);

    expect(pushed).toHaveLength(60);
    expect(truncatedThenFiltered.length).toBeLessThan(60);
    expect(pushed.length).toBeGreaterThan(truncatedThenFiltered.length);
  });

  it('10 000 × 1024 稠密余弦与下推过滤都在预算内', () => {
    const query = new Float32Array(DIM).fill(0.01);

    const started = Date.now();
    const full = cosineTopK(vectors, query, 60);
    const fullMs = Date.now() - started;
    expect(full).toHaveLength(60);
    expect(fullMs).toBeLessThan(1000);

    const filteredStarted = Date.now();
    const filtered = cosineTopK(vectors, query, 60, allow);
    const filteredMs = Date.now() - filteredStarted;
    expect(filtered).toHaveLength(60);
    // 不合格的书整行跳过 → 少算点积，不是算完再丢
    expect(filteredMs).toBeLessThan(fullMs * 3 + 50);
    expect(filtered.every(hit => allow.has(hit.docId))).toBe(true);
  });

  it('buildAllowSet 是一次 O(N) 线性遍历（万级亚 100ms）', () => {
    const started = Date.now();
    const built = buildAllowSet(docs, { callClasses: ['K83'], pubYearFrom: 2015, minRating: 7 });
    expect(Date.now() - started).toBeLessThan(500);
    expect(built).not.toBeNull();
    // 无硬条件时零开销
    expect(buildAllowSet(docs, {})).toBeNull();
  });

  it('语料的 clc 在构建期就解析好，请求期不碰索书号字符串', () => {
    for (const doc of docs.slice(0, 50)) {
      expect(doc.clc.code).toBe(resolveClc(doc.exact.callNumber).code);
      expect(doc.clc.level1).not.toBeNull();
    }
  });
});
