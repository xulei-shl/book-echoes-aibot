import { describe, expect, it } from 'vitest';
import { normalizeText, tokenize } from '@/lib/search/tokenize';

describe('tokenize', () => {
  it('分词为 CJK 滑动 bigram', () => {
    const tokens = tokenize('存在主义');
    expect(tokens).toEqual(['存在', '在主', '主义']);
  });

  it('长度为 1 的 CJK 串保留该字', () => {
    expect(tokenize('书')).toEqual(['书']);
  });

  it('ASCII 整词保留，长词叠加 2-gram 兜底', () => {
    const tokens = tokenize('Oppenheimer');
    expect(tokens[0]).toBe('oppenheimer');
    expect(tokens).toContain('op');
    expect(tokens).toContain('he');
  });

  it('含符号的索书号作为整词保留', () => {
    expect(tokenize('B842.6')).toContain('b842.6');
  });

  it('全角字符归一为半角并小写', () => {
    expect(normalizeText('ＡＢＣ１２３')).toBe('abc123');
    expect(tokenize('ＡＢＣ')).toContain('abc');
  });

  it('过滤停用词与纯标点', () => {
    const tokens = tokenize('我想找一本关于焦虑的书');
    expect(tokens).not.toContain('我');
    expect(tokens).not.toContain('一本');
    expect(tokens).not.toContain('关于');
    expect(tokens).toContain('焦虑');
  });

  it('中文标点与空格作为分隔符', () => {
    expect(tokenize('《活着》，余华')).toEqual(
      expect.arrayContaining(['活着', '余华'])
    );
  });

  it('空字符串返回空数组', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
  });

});
