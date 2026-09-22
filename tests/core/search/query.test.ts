import { describe, expect, it } from 'vitest';
import { explicitToFilters, normalizeQuery } from '@/lib/search/query';

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

  it('不把正文里的字当语气词删掉（酒吧 / 哈耶克）', () => {
    expect(normalizeQuery('酒吧文化的书').core).toContain('酒吧');
    expect(normalizeQuery('哈耶克的书').core).toContain('哈耶克');
    expect(normalizeQuery('哈姆雷特讲什么').core).toContain('哈姆雷特');
  });

  it('独立成词的语气词仍然被剥离', () => {
    const result = normalizeQuery('有没有悲伤的书 ， 吗');
    expect(result.core).not.toContain('吗');
    expect(result.terms).toContain('悲伤');
  });

  it('显式约束里的数字不作为检索 term', () => {
    const result = normalizeQuery('2015年以后出版的焦虑书');
    expect(result.terms).not.toContain('2015');
    expect(result.terms).toContain('焦虑');
  });

  it('否定表达不会把条件反过来执行', () => {
    expect(normalizeQuery('不要2015年以后出版的').explicit.year).toBeUndefined();
    expect(normalizeQuery('评分低于8分的轻松读物').explicit.rating).toBeUndefined();
    // 否定在不同子句里，不应否决本子句的条件
    expect(normalizeQuery('不要小说，2015年以后出版的').explicit.year).toBe(2015);
  });

  it('上界表达里的「超过」不被当成下限（不超过 / 不多于）', () => {
    // 「不超过」的「超过」是上界词的一半，被 GT 正则吃掉后不能当「高于」用
    expect(normalizeQuery('评分不超过7分的书').explicit.rating).toBeUndefined();
    expect(normalizeQuery('不超过8分').explicit.rating).toBeUndefined();
    expect(normalizeQuery('评分不多于8分的书').explicit.rating).toBeUndefined();
    // 对照：真正的下限表达仍然生效
    expect(normalizeQuery('评分超过8分的书').explicit.rating).toBe(8);
    expect(normalizeQuery('评分高于8分').explicit.rating).toBe(8);
  });

  it('「不要非虚构」不被误判为排斥虚构类', () => {
    expect(normalizeQuery('不要非虚构，想看小说').explicit.excludeFiction).toBeUndefined();
  });

  it('相对时间按 now 解析成出版年下限（缺 now 时不猜）', () => {
    const now = new Date('2026-09-22T00:00:00Z');
    expect(normalizeQuery('近三年出版的焦虑书', { now }).explicit.year).toBe(2023);
    expect(normalizeQuery('过去五年出版的书', { now }).explicit.year).toBe(2021);
    expect(normalizeQuery('近三年出版的书').explicit.year).toBeUndefined();
  });
});

describe('explicitToFilters', () => {
  it('年份与评分映射到对应过滤器，excludeFiction 原样透传', () => {
    expect(
      explicitToFilters({ year: 2024, rating: 8, excludeFiction: true })
    ).toEqual({ pubYearFrom: 2024, minRating: 8, excludeFiction: true });
  });

  it('无约束时返回空对象（不注入默认值）', () => {
    expect(explicitToFilters({})).toEqual({});
  });
});
