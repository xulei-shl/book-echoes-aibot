import { mostSpecificClass, type ClcClass } from './clc';
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

/**
 * 中图法类目选项：`c0..cN` → 短标签，外加 `__none__`。
 *
 * 与图书候选同一套纪律 —— 选项 id 由代码生成，模型只能挑一个已给出的 key：
 * 因此它**不可能返回一个表里没有的类号**（未知 key 在 `resolveClassKey` 里一律 undefined）。
 */
export interface ClassOptionMap {
  /** `c0..cN` → `K92 中国地理`；含 `__none__` */
  criteria: Record<string, string | null>;
  /** key → 类号 */
  codes: Map<string, string>;
  /** 类目数（不含 sentinel） */
  size: number;
}

/**
 * 类目选项上限（不含 sentinel）。
 *
 * 官方硬限是每道 choice **最多 255 个选项**（`API reference.md` L125），
 * 留出余量并防住「馆藏增长到覆盖几百个类目」的边界：
 * 调用方先按馆藏量截断，这里是第二道闸。
 */
export const CLASS_OPTION_MAX = 200;

/**
 * 类目选项的**两级**切分。
 *
 * 为什么分两级：`K 历史、地理` 与 `K92 中国地理` 若并列在一次 104 选 1 里，
 * 「中国地理类图书」就必须在「语义包含自己的祖先」和「自己」之间做 104 路区分——
 * 这是经典的祖先/后代混淆。拆成「先判是不是在按类目筛 + 哪个大类」与
 * 「在该学科内选具体类」两道独立题后，每道题的选项都很少，混淆在结构上消失。
 *
 * 切分按**路径槽位**（`level1` vs `level2/level3`）而非字符串长度：
 * T 类的二级是 `TB`/`TP`/`TU` 这类双字母，按长度切会错。
 */
export interface ClassOptionSets {
  /** 22 大类中馆藏实际出现的那几个（粗判：「是不是在按类目筛」+ 哪个大类） */
  level1: ClcClass[];
  /** 二级 / 三级类目（馆藏实际出现的），用于在学科内选更具体的类 */
  detail: ClcClass[];
}

/** 按类号排序：key 分配因此是确定性的（同一语料 → 同一份 `c0..cN`）。 */
const byCode = (a: ClcClass, b: ClcClass): number => a.code.localeCompare(b.code);

/**
 * 由**语料里实际出现的类号**构造选项（而非全表 500+ 个类号）：
 * 每个选项都真的有书，模型不会挑到一个必然返回空结果的类。
 */
export function classOptionSetsFromCorpus(
  corpus: SearchDoc[],
  max = CLASS_OPTION_MAX
): ClassOptionSets {
  const level1 = new Map<string, ClcClass>();
  const detail = new Map<string, ClcClass>();
  const counts = new Map<string, number>();
  for (const doc of corpus) {
    if (doc.clc.level1) level1.set(doc.clc.level1.code, doc.clc.level1);
    for (const node of [doc.clc.level2, doc.clc.level3]) {
      if (!node) continue;
      detail.set(node.code, node);
      counts.set(node.code, (counts.get(node.code) ?? 0) + 1);
    }
  }

  const details = [...detail.values()].sort(byCode);
  return {
    // 一级恒为 22 大类之一，天然远低于选项上限，无需截断
    level1: [...level1.values()].sort(byCode),
    detail:
      details.length <= max
        ? details
        : // 超限时保留藏书最多的那些类（少见的类照样能靠语义召回找到）
          details
            .sort(
              (a, b) =>
                (counts.get(b.code) ?? 0) - (counts.get(a.code) ?? 0) || byCode(a, b)
            )
            .slice(0, max)
            .sort(byCode)
  };
}

export function makeClassOptionMap(
  classes: ClcClass[],
  noneLabel = 'query 不是在按分类筛选，或想要的类目不在上面的列表里'
): ClassOptionMap {
  const criteria: Record<string, string | null> = {};
  const codes = new Map<string, string>();
  classes.forEach((entry, index) => {
    const key = `c${index}`;
    criteria[key] = `${entry.code} ${entry.label}`;
    codes.set(key, entry.code);
  });
  criteria[NONE_KEY] = noneLabel;
  return { criteria, codes, size: classes.length };
}

/** 未知 key（含 `__none__`）一律 undefined（不抛）。 */
export function resolveClassKey(map: ClassOptionMap, key: string): string | undefined {
  return map.codes.get(key);
}

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

/**
 * 精排用：这本书的中图法类目名（`K92 中国地理`）；认不出时为 `null`（**不编造**）。
 *
 * 只给索书号（`K928.42`）模型认不出学科 —— 等于让精排在不知道类目的情况下打分。
 */
export function clcLabelFor(doc: SearchDoc): string | null {
  const node = mostSpecificClass(doc.clc);
  return node ? `${node.code} ${node.label}` : null;
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
