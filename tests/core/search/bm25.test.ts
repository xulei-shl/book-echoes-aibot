import { describe, expect, it } from 'vitest';
import { buildIndex, estimateIndexBytes, search, termIdf } from '@/lib/search/bm25';
import type { SearchDoc, SearchFields } from '@/lib/search/types';

function makeDoc(id: string, fields: Partial<SearchFields>): SearchDoc {
  return {
    id,
    sourceId: '2026-06',
    book: {
      id,
      month: '2026-06',
      title: fields.title ?? '',
      author: '',
      publisher: '',
      pubYear: '',
      pages: '',
      rating: '',
      callNumber: '',
      callNumberLink: '',
      isbn: '',
      recommendation: '',
      summary: '',
      authorIntro: '',
      catalog: '',
      coverUrl: ''
    },
    fields: {
      title: '',
      subtitle: '',
      author: '',
      translator: '',
      publisher: '',
      subjects: '',
      reason: '',
      summary: '',
      toc: '',
      ...fields
    },
    exact: { isbn: '', barcode: id, callNumber: '' },
    numeric: { rating: 0, pubYear: 0, pages: 0 },
    hash: id
  };
}

describe('bm25', () => {
  it('空查询或无命中返回空', () => {
    const index = buildIndex([makeDoc('1', { title: '焦虑的意义' })]);
    expect(search(index, [], 10)).toEqual([]);
    expect(search(index, ['柴油机'], 10)).toEqual([]);
  });

  it('标题命中优于目录命中（字段权重生效）', () => {
    const index = buildIndex([
      makeDoc('title-hit', { title: '存在主义心理治疗' }),
      makeDoc('toc-hit', { toc: '存在主义心理治疗' })
    ]);
    const results = search(index, ['存在'], 10);
    expect(results[0].docId).toBe('title-hit');
  });

  it('结果按分数降序且带命中 term', () => {
    const index = buildIndex([
      makeDoc('a', { title: '孤独的城市', summary: '关于孤独' }),
      makeDoc('b', { title: '城市与生活' }),
      makeDoc('c', { title: '园艺手册' })
    ]);
    const results = search(index, ['孤独'], 10);
    expect(results.map(r => r.docId)).toEqual(['a']);
    expect(results[0].matched).toContain('孤独');
  });

  it('未知 term 的 IDF 为兜底值且不抛错', () => {
    const index = buildIndex([makeDoc('1', { title: '焦虑' })]);
    expect(termIdf(index, '不存在的词')).toBeGreaterThan(0);
  });

  it('1000 本合成索引常驻内存 < 15MB（防 R10 回退到嵌套 Map）', () => {
    const docs = Array.from({ length: 1000 }, (_, i) =>
      makeDoc(String(i), {
        title: `合成书籍第${i}号`,
        summary: '这是一个用于内存上限回归测试的合成简介，内容重复且词汇量受控。'
      })
    );
    const index = buildIndex(docs);
    expect(index.docs).toHaveLength(1000);
    expect(estimateIndexBytes(index)).toBeLessThan(15 * 1024 * 1024);
  });
});
