import { describe, expect, it } from 'vitest';
import { rrfFuse } from '@/lib/search/fusion';
import type { RecallResult } from '@/lib/search/types';

const hit = (
  docId: string,
  lane: string,
  score: number,
  matched: string[] = []
): RecallResult => ({
  docId,
  score,
  lanes: [lane],
  matched,
  laneScores: { [lane]: score }
});

describe('rrfFuse', () => {
  it('按名次合并而非分数相加', () => {
    const lane1 = [hit('a', 'lexical', 99), hit('b', 'lexical', 1)];
    const lane2 = [hit('b', 'dense', 0.9), hit('c', 'dense', 0.1)];
    const fused = rrfFuse([lane1, lane2]);
    expect(fused.map(r => r.docId)).toEqual(['b', 'a', 'c']);
  });

  it('合并 lanes 与 matched，laneScores 取各 lane 原始分', () => {
    const fused = rrfFuse([
      [hit('a', 'lexical', 12, ['焦虑'])],
      [hit('a', 'dense', 0.7, ['孤独'])]
    ]);
    expect(fused).toHaveLength(1);
    expect([...fused[0].lanes].sort()).toEqual(['dense', 'lexical']);
    expect(fused[0].matched).toEqual(expect.arrayContaining(['焦虑', '孤独']));
    expect(fused[0].laneScores).toEqual({ lexical: 12, dense: 0.7 });
  });

  it('单 lane 缺失时不崩', () => {
    const fused = rrfFuse([[hit('a', 'lexical', 1)], []]);
    expect(fused.map(r => r.docId)).toEqual(['a']);
  });

  it('全部为空返回空数组', () => {
    expect(rrfFuse([])).toEqual([]);
    expect(rrfFuse([[], []])).toEqual([]);
  });

  it('使用可覆写的 k 值', () => {
    const fused = rrfFuse([[hit('a', 'lexical', 1)]], { k: 0 });
    expect(fused[0].score).toBe(1);
  });
});
