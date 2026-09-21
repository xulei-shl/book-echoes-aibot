import { EXCERPT_MAX_CHARS, GIST_MAX_CHARS, LABEL_MAX_CHARS } from './config';
import type { SearchDoc } from './types';

/**
 * 「代码造候选、模型只挑不透明 id」。
 *
 * 固定顺序 + 稳定 id + 内容哈希；绝不让模型看到真实条码，避免模型把条码当字符串生成。
 * 回答文本永远不会变成书名、文件路径或 URL —— `resolve()` 是唯一的还原点。
 */

export interface OptionEntry {
  key: string;
  docId: string;
  contentHash: string;
}

export interface OptionMap {
  entries: OptionEntry[];
  size: number;
  byKey: Map<string, SearchDoc>;
}

export const NONE_KEY = '__none__';

export function makeOptionMap(docs: SearchDoc[]): OptionMap {
  const byKey = new Map<string, SearchDoc>();
  const entries = docs.map((doc, index) => {
    const key = `b${index}`;
    byKey.set(key, doc);
    return { key, docId: doc.id, contentHash: doc.hash };
  });
  return { entries, size: docs.length, byKey };
}

/** 未知 key 一律 undefined（不抛）。 */
export function resolve(map: OptionMap, key: string): SearchDoc | undefined {
  return map.byKey.get(key);
}

export function truncate(text: string, max: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

/** criteria 只放短标签（书名 + 作者 + 出版年），≤160 字符。 */
export function labelFor(doc: SearchDoc): string {
  const year = doc.numeric.pubYear || doc.book.pubYear;
  const author = doc.book.author || '佚名';
  const head = `《${doc.book.title || doc.id}》— ${author}${year ? `（${year}）` : ''}`;
  return truncate(head, LABEL_MAX_CHARS);
}

/** wide 粗选只需要主题轮廓：简介前 160 字。 */
export function gistFor(doc: SearchDoc, max = GIST_MAX_CHARS): string {
  const base = doc.fields.summary || doc.fields.reason || doc.fields.title;
  return truncate(base, max);
}

/** 精排证据：内容简介 + 初评理由，截断 600 字。 */
export function excerptFor(doc: SearchDoc, max = EXCERPT_MAX_CHARS): string {
  const parts = [doc.fields.summary, doc.fields.reason].map(part => part.trim()).filter(Boolean);
  return truncate(parts.join(' / '), max);
}

/** choice 的 criteria：b0..bN 的短标签 + sentinel。 */
export function criteriaFor(map: OptionMap, noneLabel: string): Record<string, string | null> {
  const criteria: Record<string, string | null> = {};
  for (const entry of map.entries) {
    const doc = map.byKey.get(entry.key);
    criteria[entry.key] = doc ? labelFor(doc) : null;
  }
  criteria[NONE_KEY] = noneLabel;
  return criteria;
}
