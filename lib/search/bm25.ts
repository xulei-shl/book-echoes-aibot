import { tokenize } from './tokenize';
import { FIELD_WEIGHTS, getTuning } from './tuning';
import type { ScoredDoc, SearchDoc, SearchFields } from './types';

/**
 * BM25F（简化）索引。
 *
 * ⚠️ 倒排表必须用 **CSR（压缩稀疏行）+ TypedArray**，不要用 Map<string, Map<number, number>>。
 *    实测（443 本）：385 546 个 (term, doc) 倒排对。若用嵌套 Map，每个 entry 有 50–100 字节
 *    的对象开销，5000 本时（435 万倒排对）会占 200–400 MB —— 这是隐性 OOM。
 *    CSR 用两个 Int32Array + 一个词表数组，5000 本时仅 ~45 MB。
 */
export interface Bm25Index {
  docs: SearchDoc[];
  /** 词表，按字典序排列（二分查找） */
  terms: string[];
  /** len = terms.length + 1 */
  offsets: Int32Array;
  /** len = 倒排对数 */
  docIds: Int32Array;
  /** len = 倒排对数 */
  tfs: Int32Array;
  df: Int32Array;
  docLen: Int32Array;
  avgLen: number;
}

// 字段权重与 BM25 参数在 tuning.ts（调参入口），本文件只消费。

export function buildIndex(docs: SearchDoc[]): Bm25Index {
  const postings = new Map<string, Map<number, number>>();
  const docLen = new Int32Array(docs.length);
  let totalLen = 0;

  docs.forEach((doc, docIndex) => {
    let length = 0;
    for (const [field, weight] of Object.entries(FIELD_WEIGHTS) as [keyof SearchFields, number][]) {
      const text = doc.fields[field];
      if (!text) continue;
      const counts = new Map<string, number>();
      for (const token of tokenize(text)) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
      for (const [term, count] of counts) {
        const weightedTf = Math.max(1,      Math.round(count * weight));
        let plist = postings.get(term);
        if (!plist) {
          plist = new Map<number, number>();
          postings.set(term, plist);
        }
        plist.set(docIndex, (plist.get(docIndex) ?? 0) + weightedTf);
        length += weightedTf;
      }
    }
    docLen[docIndex] = Math.max(1, length);
    totalLen += docLen[docIndex];
  });

  const terms = [...postings.keys()].sort();
  const offsets = new Int32Array(terms.length + 1);
  let pairs = 0;
  terms.forEach((term, termIndex) => {
    offsets[termIndex] = pairs;
    pairs += postings.get(term)!.size;
  });
  offsets[terms.length] = pairs;

  const docIds = new Int32Array(pairs);
  const tfs = new Int32Array(pairs);
  const df = new Int32Array(terms.length);

  let cursor = 0;
  terms.forEach((term, termIndex) => {
    const plist = postings.get(term)!;
    df[termIndex] = plist.size;
    const entries = [...plist.entries()].sort((a, b) => a[0] - b[0]);
    for (const [docId, tf] of entries) {
      docIds[cursor] = docId;
      tfs[cursor] = tf;
      cursor += 1;
    }
  });

  return {
    docs,
    terms,
    offsets,
    docIds,
    tfs,
    df,
    docLen,
    avgLen: docs.length > 0 ? totalLen / docs.length : 0
  };
}

/** 词表二分查找。 */
export function findTerm(index: Bm25Index, term: string): number {
  let low = 0;
  let high = index.terms.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = index.terms[mid];
    if (value === term) return mid;
    if (value < term) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

/** BM25 的 IDF（Lucene 的概率性变体）。打分与查询侧截断共用同一份公式。 */
const idfOf = (docCount: number, docFreq: number): number =>
  Math.log(1 + (docCount - docFreq + 0.5) / (docFreq + 0.5));

/**
 * 查询侧 IDF：用于 `normalizeQuery` 的按区分度截断（不参与打分）。
 * `unseenIdf` 由调用方从生效调参传入（避免排序比较器里反复解析环境变量）。
 */
export function termIdf(index: Bm25Index, term: string, unseenIdf?: number): number {
  const termIndex = findTerm(index, term);
  if (termIndex < 0) return unseenIdf ?? getTuning().effective.unseenTermIdf;
  return idfOf(index.docs.length, index.df[termIndex]);
}

/**
 * BM25 检索，返回按分数降序的 top-K。
 *
 * `allow` 是硬条件下推的允许集合（`recall.ts::buildAllowSet`）：在**收集结果时**就剔除不合条件的书，
 * 也就是过滤发生在 `slice(0, topK)` **之前**。万级语料下这一步不增加任何计算量
 * （倒排表该走还得走），只是把截断挪到过滤之后 —— 换来的是可靠召回，不是速度。
 */
export function search(
  index: Bm25Index,
  queryTerms: string[],
  topK: number,
  allow?: ReadonlySet<string> | null
): ScoredDoc[] {
  const n = index.docs.length;
  if (n === 0) return [];
  const { k1, b } = getTuning().effective.bm25;
  const scores = new Float64Array(n);
  const touched = new Map<number, string[]>();

  for (const term of new Set(queryTerms)) {
    const termIndex = findTerm(index, term);
    if (termIndex < 0) continue;
    const idf = idfOf(n, index.df[termIndex]);
    const start = index.offsets[termIndex];
    const end = index.offsets[termIndex + 1];
    for (let p = start; p < end; p += 1) {
      const docId = index.docIds[p];
      const tf = index.tfs[p];
      const denom = tf + k1 * (1 - b + (b * index.docLen[docId]) / (index.avgLen || 1));
      scores[docId] += (idf * (tf * (k1 + 1))) / denom;
      const matched = touched.get(docId);
      if (matched) matched.push(term);
      else touched.set(docId, [term]);
    }
  }

  const results: ScoredDoc[] = [];
  touched.forEach((matched, docId) => {
    if (scores[docId] <= 0) return;
    const id = index.docs[docId].id;
    if (allow && !allow.has(id)) return;
    results.push({ docId: id, score: scores[docId], matched });
  });
  results.sort((a, b) => b.score - a.score || a.docId.localeCompare(b.docId));
  return results.slice(0, topK);
}

/** 索引常驻内存估算（仅统计 TypedArray + 词表），供内存上限回归测试使用。 */
export function estimateIndexBytes(index: Bm25Index): number {
  const pairBytes = index.docIds.byteLength + index.tfs.byteLength;
  const metaBytes = index.offsets.byteLength + index.df.byteLength + index.docLen.byteLength;
  // 词表按每个 term ~20 字节（V8 短字符串 + 指针）粗估
  return pairBytes + metaBytes + index.terms.length * 20;
}
