import { describe, expect, it } from 'vitest';
import { normalizeQuery } from '@/lib/search/query';

describe('normalizeQuery', () => {
  it('保留原始句子供稠密 lane 使用', () => {
    const raw = '有没有关于焦虑的书';
    const result = normalizeQuery(raw);
    expect(result.raw).toBe(raw);
  });

  it('剥离疑问与请求套话', () => {
    const result = normalizeQuery('有没有关于悲伤的书');
    expect(result.core).not.toContain('有没有');
    expect(result.core).not.toContain('关于');
    expect(result.terms).toContain('悲伤');
  });

  it('抽取年份下限', () => {
    expect(normalizeQuery('2015年以后出版的小说').explicit.year).toBe(2015);
  });

  it('抽取评分下限', () => {
    expect(normalizeQuery('豆瓣评分8分以上的书').explicit.rating).toBe(8);
    expect(normalizeQuery('高于7分的推荐').explicit.rating).toBe(7);
  });

  it('识别排斥虚构类', () => {
    expect(normalizeQuery('不要小说的非虚构读物').explicit.excludeFiction).toBe(true);
  });

  it('全是套话时回退到原句分词', () => {
    const result = normalizeQuery('推荐一下');
    expect(result.terms.length).toBeGreaterThan(0);
  });

  it('提供 idf 时按 IDF 保留前 N 个 term', () => {
    const idf = (term: string) => (term === '存在' ? 10 : term === '主义' ? 9 : 1);
    const result = normalizeQuery('存在主义 城市 生活 孤独 意义 焦虑 成长', { idf, maxTerms: 2 });
    expect(result.terms).toEqual(['存在', '主义']);
  });

  it('没有 idf 时按顺序截断', () => {
    const result = normalizeQuery('存在主义 城市 生活 孤独 意义 焦虑 成长', { maxTerms: 2 });
    expect(result.terms).toEqual(['存在', '在主']);
  });
});
