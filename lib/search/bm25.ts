import { tokenize } from './tokenize';
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

/** 字段权重（按字段加权求和 tf） */
export const FIELD_WEIGHTS: Record<keyof SearchFields, number> = {
  title: 3.0,
  subtitle: 1.5,
  author: 2.0,
  translator: 0.8,
  publisher: 0.8,
  subjects: 1.0,
  reason: 1.2,
  summary: 1.0,
  toc: 0.6
};

const K1 = 1.2;
const B = 0.75;

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
        const weightedTf = Math.max(1, Math.round(count * weight));
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

export function termIdf(index: Bm25Index, term: string): number {
  const termIndex = findTerm(index, term);
  const n = index.docs.length;
  if (termIndex < 0) return Math.log(1 + n + 0.5);
  const df = index.df[termIndex];
  return Math.log(1 + (n - df + 0.5) / (df + 0.5));
}

/** BM25 检索，返回按分数降序的 top-K。 */
export function search(index: Bm25Index, queryTerms: string[], topK: number): ScoredDoc[] {
  const n = index.docs.length;
  if (n === 0) return [];
  const scores = new Float64Array(n);
  const touched = new Map<number, string[]>();

  for (const term of new Set(queryTerms)) {
    const termIndex = findTerm(index, term);
    if (termIndex < 0) continue;
    const df = index.df[termIndex];
    const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
    const start = index.offsets[termIndex];
    const end = index.offsets[termIndex + 1];
    for (let p = start; p < end; p += 1) {
      const docId = index.docIds[p];
      const tf = index.tfs[p];
      const denom = tf + K1 * (1 - B + (B * index.docLen[docId]) / (index.avgLen || 1));
      scores[docId] += (idf * (tf * (K1 + 1))) / denom;
      const matched = touched.get(docId);
      if (matched) matched.push(term);
      else touched.set(docId, [term]);
    }
  }

  const results: ScoredDoc[] = [];
  touched.forEach((matched, docId) => {
    if (scores[docId] > 0) {
      results.push({ docId: index.docs[docId].id, score: scores[docId], matched });
    }
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
