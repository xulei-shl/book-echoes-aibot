import { describe, expect, it } from 'vitest';
import { resolveClc } from '@/lib/search/clc';
import {
  CLASS_OPTION_MAX,
  NONE_KEY,
  classOptionSetsFromCorpus,
  makeClassOptionMap,
  resolveClassKey
} from '@/lib/search/options';
import type { SearchDoc } from '@/lib/search/types';

/**
 * `call_class_l1` / `call_class_l2` 的选项由**语料里实际出现的类号**派生，不是全表 500+ 个类号。
 *
 * 三条必须守住的纪律：
 * 1. 分两级：`K 历史、地理` 与 `K92 中国地理` 不能并列在同一次选择里（祖先/后代混淆）；
 * 2. 切分按**路径槽位**，不按字符串长度（T 类的二级是 `TB`/`TP`/`TU` 这类双字母）；
 * 3. 每道题的选项数都留在官方硬限（每道 choice 最多 255 个）之内，且模型只能从给出的 key 里挑。
 */

/** 只需要 `clc` 字段：选项构造完全由类目路径驱动 */
const docWith = (callNumber: string): SearchDoc => ({ clc: resolveClc(callNumber) }) as SearchDoc;

const codes = (entries: { code: string }[]): string[] => entries.map(entry => entry.code);

describe('options / classOptionSetsFromCorpus', () => {
  const corpus = [
    docWith('B842.6'),
    docWith('B842.6'),
    docWith('K928.42'),
    docWith('K928.42'),
    docWith('TP311.5')
  ];
  const sets = classOptionSetsFromCorpus(corpus);

  it('一级只放 22 大类，二级/三级全部落到 detail', () => {
    expect(codes(sets.level1)).toEqual(['B', 'K', 'T']);
    // B842.6 → B84（非 T 类无三级）；K928.42 → K92；TP311.5 → TP 与 TP311
    expect(codes(sets.detail)).toEqual(['B84', 'K92', 'TP', 'TP311']);
  });

  it('切分按路径槽位而非字符串长度 —— T 类双字母二级不会漏', () => {
    expect(sets.level1.map(entry => entry.code)).not.toContain('TP');
    expect(codes(sets.detail)).toContain('TP');
    // 一级天然 ≤ 22 个大类，永远不需要截断
    expect(sets.level1.length).toBeLessThanOrEqual(22);
  });

  it('两组各自去重并按类号排序（key 分配因此确定）', () => {
    for (const entries of [sets.level1, sets.detail]) {
      const list = codes(entries);
      expect(list).toEqual([...new Set(list)]);
      expect(list).toEqual([...list].sort((a, b) => a.localeCompare(b)));
    }
  });

  it('每个类号都真的来自某本书的类目路径', () => {
    const present = new Set(
      corpus.flatMap(doc =>
        [doc.clc.level1, doc.clc.level2, doc.clc.level3]
          .filter((node): node is NonNullable<typeof node> => node !== null)
          .map(node => node.code)
      )
    );
    expect([...codes(sets.level1), ...codes(sets.detail)].every(code => present.has(code))).toBe(
      true
    );
  });

  it('超限时只截断 detail（保留藏书最多的类），且重新按类号排序', () => {
    // 计数：B84 2 / K92 2 / TP 1 / TP311 1 → 取前 2 后按类号排序
    expect(codes(classOptionSetsFromCorpus(corpus, 2).detail)).toEqual(['B84', 'K92']);
  });

  it('两道题的选项数都留在官方 255 硬限之内', () => {
    expect(CLASS_OPTION_MAX).toBeLessThanOrEqual(254);
    expect(sets.level1.length + 1).toBeLessThanOrEqual(255);
    expect(sets.detail.length + 1).toBeLessThanOrEqual(255);
  });
});

describe('options / makeClassOptionMap', () => {
  const sets = classOptionSetsFromCorpus([docWith('K928.42'), docWith('B842.6')]);
  const map = makeClassOptionMap(sets.level1, '不是按类目筛');

  it('key 固定为 c0..cN，标签是「类号 + 类名」', () => {
    const keys = Object.keys(map.criteria).filter(key => key !== NONE_KEY);
    expect(keys).toEqual(sets.level1.map((_, index) => `c${index}`));
    expect(map.criteria.c0).toBe(`${sets.level1[0].code} ${sets.level1[0].label}`);
    expect(map.size).toBe(sets.level1.length);
  });

  it('criteria 里带 __none__ sentinel，且标签可逐题定制', () => {
    expect(map.criteria[NONE_KEY]).toBe('不是按类目筛');
  });

  it('未知 key 与 __none__ 一律 undefined —— 模型编不出表里没有的类号', () => {
    expect(resolveClassKey(map, 'c0')).toBe(sets.level1[0].code);
    expect(resolveClassKey(map, NONE_KEY)).toBeUndefined();
    expect(resolveClassKey(map, 'c99')).toBeUndefined();
    expect(resolveClassKey(map, 'K92')).toBeUndefined();
  });
});
