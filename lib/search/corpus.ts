import { promises as fs } from 'node:fs';
import path from 'node:path';
import { transformMetadataToBook } from '@/lib/utils';
import { resolveClc } from './clc';
import { CORPUS_TTL_MS } from './config';
import type { SearchDoc } from './types';

/**
 * 检索语料：直接读 public/content 下各级目录的 metadata.json。
 *
 * 刻意不复用 `getArchiveData()` 的全部开销（它会扫描 md 文件名、生成含 Math.random()
 * 的 previewCards），也刻意不落盘（443 本分词建索引在 100ms 量级）。
 */

let corpusCache: { loadedAt: number; docs: SearchDoc[] } | null = null;

/** 同一本书出现在多个归档时的来源优先级（R6）：subject > literature > sleeping > month */
const SOURCE_PRIORITY: Record<string, number> = {
  subject: 0,
  literature: 1,
  sleeping: 2,
  month: 3
};

export function sourceKind(sourceId: string): keyof typeof SOURCE_PRIORITY {
  if (/-subject-/.test(sourceId)) return 'subject';
  if (/-literature-/.test(sourceId)) return 'literature';
  if (/-sleeping-/.test(sourceId)) return 'sleeping';
  return 'month';
}

/** FNV-1a 32 位内容指纹（足够做缓存失效，不需要密码学强度）。 */
export function contentHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const asText = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

export function toSearchDoc(raw: Record<string, unknown>, sourceId: string): SearchDoc | null {
  const book = transformMetadataToBook(
    raw as Record<string, string | number | undefined>,
    sourceId
  );
  if (!book.id) return null;

  const fields = {
    title: book.title,
    subtitle: book.subtitle ?? '',
    author: book.author,
    translator: book.translator ?? '',
    publisher: book.publisher,
    subjects: [book.callNumber, book.series ?? '', book.producer ?? '']
      .map(asText)
      .filter(Boolean)
      .join(' '),
    reason: book.reason ?? '',
    summary: book.summary,
    toc: book.catalog
  };

  const hash = contentHash(
    [
      fields.title,
      fields.subtitle,
      fields.author,
      fields.translator,
      fields.publisher,
      fields.subjects,
      fields.reason,
      fields.summary,
      fields.toc,
      book.isbn
    ].join('\u0000')
  );

  return {
    id: book.id,
    sourceId,
    book,
    fields,
    exact: {
      isbn: book.isbn,
      barcode: book.id,
      callNumber: book.callNumber
    },
    // 中图法类目在这里解析一次：请求期只做 Set 命中判断，10 000 本时也不会成为热点
    clc: resolveClc(book.callNumber),
    numeric: {
      rating: Number.parseFloat(book.rating) || 0,
      pubYear: Number.parseInt(book.pubYear, 10) || 0,
      pages: Number.parseInt(book.pages, 10) || 0
    },
    hash
  };
}

async function readMetadataBooks(filePath: string): Promise<Record<string, unknown>[]> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

async function collectFromDir(dirPath: string, sourceId: string): Promise<SearchDoc[]> {
  const raws = await readMetadataBooks(path.join(dirPath, 'metadata.json'));
  const docs: SearchDoc[] = [];
  for (const raw of raws) {
    const doc = toSearchDoc(raw, sourceId);
    if (doc) docs.push(doc);
  }
  return docs;
}

/** 以条码为唯一键去重，保留来源优先级更高的一侧，其余来源记入 alsoIn。 */
export function dedupeByBarcode(docs: SearchDoc[]): SearchDoc[] {
  const byId = new Map<string, SearchDoc>();
  for (const doc of docs) {
    const existing = byId.get(doc.id);
    if (!existing) {
      byId.set(doc.id, doc);
      continue;
    }
    const existingRank = SOURCE_PRIORITY[sourceKind(existing.sourceId)];
    const incomingRank = SOURCE_PRIORITY[sourceKind(doc.sourceId)];
    const winner = incomingRank < existingRank ? doc : existing;
    const loser = winner === doc ? existing : doc;
    const alsoIn = new Set([...(winner.alsoIn ?? []), loser.sourceId]);
    byId.set(doc.id, { ...winner, alsoIn: [...alsoIn] });
  }
  return [...byId.values()];
}

async function walkDirectory(dirPath: string, visit: (dir: string, sourceId: string) => Promise<void>) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    await visit(path.join(dirPath, entry.name), entry.name);
  }
}

/**
 * 读取全部馆藏并转换为 SearchDoc[]（进程内缓存 + TTL，与 loadRandomIndex 同范式）。
 * 首次请求建语料，之后复用；`public/content` 一改、进程重启即生效。
 */
export async function getSearchCorpus(): Promise<SearchDoc[]> {
  if (corpusCache && Date.now() - corpusCache.loadedAt < CORPUS_TTL_MS) {
    return corpusCache.docs;
  }

  const contentDir = path.join(process.cwd(), 'public', 'content');
  const docs: SearchDoc[] = [];

  try {
    const yearEntries = await fs.readdir(contentDir, { withFileTypes: true });
    const yearDirs = yearEntries
      .filter(entry => entry.isDirectory() && /^\d{4}$/.test(entry.name))
      .map(entry => entry.name);

    for (const year of yearDirs) {
      const yearPath = path.join(contentDir, year);
      const entries = await fs.readdir(yearPath, { withFileTypes: true });

      // 月份目录
      const monthEntries = entries.filter(
        entry =>
          entry.isDirectory() &&
          entry.name !== 'subject' &&
          entry.name !== 'new' &&
          entry.name !== 'literature' &&
          !entry.name.startsWith('.')
      );
      for (const entry of monthEntries) {
        docs.push(...(await collectFromDir(path.join(yearPath, entry.name), entry.name)));
      }

      // 主题卡
      if (entries.some(entry => entry.isDirectory() && entry.name === 'subject')) {
        await walkDirectory(path.join(yearPath, 'subject'), async (dir, name) => {
          docs.push(...(await collectFromDir(dir, `${year}-subject-${name}`)));
        });
      }

      // 睡美人（目录名 new）
      if (entries.some(entry => entry.isDirectory() && entry.name === 'new')) {
        await walkDirectory(path.join(yearPath, 'new'), async (dir, name) => {
          docs.push(...(await collectFromDir(dir, `${year}-sleeping-${name}`)));
        });
      }

      // 文学 FM
      if (entries.some(entry => entry.isDirectory() && entry.name === 'literature')) {
        await walkDirectory(path.join(yearPath, 'literature'), async (dir, name) => {
          docs.push(...(await collectFromDir(dir, `${year}-literature-${name}`)));
        });
      }
    }
  } catch (error) {
    console.warn('[search] 语料读取失败:', error);
  }

  const deduped = dedupeByBarcode(docs);
  corpusCache = { loadedAt: Date.now(), docs: deduped };
  return deduped;
}

/** 测试与构建脚本用：清空进程内缓存。 */
export function resetCorpusCache(): void {
  corpusCache = null;
}
