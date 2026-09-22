import { describe, expect, it } from 'vitest';
import { CLC_LEVEL1, clcCodeOf, resolveClc } from '@/lib/search/clc';
import { getSearchCorpus } from '@/lib/search/corpus';

/**
 * 用**真实馆藏**守住中图法类目的覆盖面。
 *
 * 这是一个「新增数据」哨兵：表是可以增量的（解析会逐级回退），但一旦来了一个
 * 我们没收录的类号，这本新书就会在按类目筛选时神秘失踪。与其等到线上发现，
 * 不如让它在 CI 里带着**具体是哪几个索书号**报出来。
 *
 * 只断言不变式、不锁死具体数量，所以正常的馆藏增长不会让它变脆。
 */
describe('clc / 真实馆藏覆盖率', () => {
  it('凡是带细分类号的索书号，都必须能归到二级或更细', async () => {
    const corpus = await getSearchCorpus();
    expect(corpus.length).toBeGreaterThan(0);

    const unresolved = corpus
      .map(doc => doc.exact.callNumber)
      // 类号只有 1 个字符 = 索书号本身就没写细分（如 `B/2911`、`B-53/4222-1`），
      // 回退到一级是正确的，不算缺口
      .filter(callNumber => resolveClc(callNumber).code.length > 1)
      .filter(callNumber => {
        const path = resolveClc(callNumber);
        return path.level2 === null && path.level3 === null;
      });

    // 失败时这条断言会把「差哪几个类号」直接打印出来
    expect([...new Set(unresolved)].sort()).toEqual([]);
  });

  it('绝大多数馆藏都能落到二级（覆盖率下限）', async () => {
    const corpus = await getSearchCorpus();
    const resolved = corpus.filter(doc => resolveClc(doc.exact.callNumber).level2 !== null);
    expect(resolved.length / corpus.length).toBeGreaterThan(0.95);
  });

  it('一级大类在真实数据里全部合法（没有中图法之外的字母）', async () => {
    const corpus = await getSearchCorpus();
    const known = new Set(CLC_LEVEL1.map(entry => entry.code));
    const unknown = corpus
      .map(doc => resolveClc(doc.exact.callNumber).level1?.code)
      .filter((code): code is string => code !== undefined && !known.has(code));
    expect(unknown).toEqual([]);
  });

  it('语料里的 clc 与索书号一致（构建期解析一次，请求期不再碰字符串）', async () => {
    const corpus = await getSearchCorpus();
    for (const doc of corpus) {
      expect(doc.clc.code).toBe(clcCodeOf(doc.exact.callNumber));
      expect(doc.clc).toEqual(resolveClc(doc.exact.callNumber));
    }
  });
});
