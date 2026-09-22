import { describe, expect, it } from 'vitest';
import {
  CLC_LEVEL1,
  clcCodeOf,
  isFictionClc,
  isKnownClcCode,
  matchesClc,
  resolveClc,
  resolveClcCode
} from '@/lib/search/clc';

/**
 * 中图法映射的回归测试。
 *
 * 重点不是「类目名抄得对不对」（那是数据，靠与图书馆简表比对），
 * 而是**解析规则**：最长前缀匹配、层级深度、以及切片伪类目永远不能出现。
 */

/** 馆藏真实索书号样本 → 期望解析结果（取自 public/content 实测数据） */
const SAMPLES: { callNumber: string; l1: string; l2: string | null; l3: string | null }[] = [
  { callNumber: 'B842.6/4895-3', l1: 'B', l2: 'B84', l3: null },
  { callNumber: 'B-53/4222-1', l1: 'B', l2: null, l3: null },
  { callNumber: 'C912.1', l1: 'C', l2: 'C91', l3: null },
  { callNumber: 'C/5922', l1: 'C', l2: null, l3: null },
  { callNumber: 'D691.9', l1: 'D', l2: 'D6', l3: null },
  { callNumber: 'E19', l1: 'E', l2: 'E1', l3: null },
  { callNumber: 'F830.59', l1: 'F', l2: 'F8', l3: null },
  { callNumber: 'G256.1', l1: 'G', l2: 'G2', l3: null },
  // 类号跳转：教育类归 G4，但类号是 G5x —— 靠祖先链而不是前缀认出来
  { callNumber: 'G519/6248', l1: 'G', l2: 'G4', l3: 'G51' },
  { callNumber: 'I247.5', l1: 'I', l2: 'I2', l3: null },
  { callNumber: 'J292.13', l1: 'J', l2: 'J29', l3: null },
  { callNumber: 'K825.6', l1: 'K', l2: 'K82', l3: null },
  { callNumber: 'K835.615.6', l1: 'K', l2: 'K83', l3: null },
  { callNumber: 'N02', l1: 'N', l2: 'N0', l3: null },
  { callNumber: 'S68', l1: 'S', l2: 'S6', l3: null },
  { callNumber: 'TP311.5', l1: 'T', l2: 'TP', l3: 'TP311' },
  { callNumber: 'TS971.2', l1: 'T', l2: 'TS', l3: 'TS97' },
  { callNumber: 'TU984', l1: 'T', l2: 'TU', l3: 'TU98' },
  { callNumber: 'Z228', l1: 'Z', l2: 'Z2', l3: null }
];

describe('clc / clcCodeOf', () => {
  it('只取类目位：遇到 . / 即停止，碰到 - 也停止', () => {
    expect(clcCodeOf('B842.6/4895-3')).toBe('B842');
    expect(clcCodeOf('TP311.5')).toBe('TP311');
    expect(clcCodeOf('K835.615.6')).toBe('K835');
    expect(clcCodeOf('B-53/4222-1')).toBe('B');
    expect(clcCodeOf('DF123')).toBe('DF123');
  });

  it('大小写不敏感，空白与中文一律识别为「无类号」', () => {
    expect(clcCodeOf('  b842.6 ')).toBe('B842');
    expect(clcCodeOf('')).toBe('');
    expect(clcCodeOf('索书号')).toBe('');
  });
});

describe('clc / resolveClc', () => {
  it.each(SAMPLES)('$callNumber → $l1 / $l2 / $l3', ({ callNumber, l1, l2, l3 }) => {
    const path = resolveClc(callNumber);
    expect(path.level1?.code).toBe(l1);
    expect(path.level2?.code ?? null).toBe(l2);
    expect(path.level3?.code ?? null).toBe(l3);
  });

  it('切片伪类目永远不会出现（K83 是真实类目的回归）', () => {
    // 「K83 各国人物传记」是表里真实存在的类号（简表用区间记法 K833/837 表示），
    // 但「B51」「I10」这类**切出来的**前缀没有对应的中图法类目，必须回退到二级
    expect(resolveClc('B516').level2?.code).toBe('B5');
    expect(resolveClc('B516').level2?.label).toBe('欧洲哲学');
    expect(resolveClc('I106').level2?.code).toBe('I1');
    expect(resolveClc('I106').level2?.label).toBe('世界文学');
    expect(resolveClc('K835.615.6').level2?.label).toBe('各国人物传记');
  });

  it('非 T 类不展开三级（level3 只由 T 类与 G4 的跳转类号填充）', () => {
    for (const callNumber of ['K835.615.6', 'B842.6', 'I247.5', 'C912.1', 'J292.13', 'G256.1']) {
      expect(resolveClc(callNumber).level3).toBeNull();
    }
    expect(resolveClc('TP311.5').level3?.code).toBe('TP311');
    expect(resolveClc('TP311.5').level3?.label).toBe('程序设计、软件工程');
  });

  it('区间记法按世界地区表展开（3 亚洲 / 5 欧洲 / 7 美洲）', () => {
    expect(resolveClc('I313.45').level2?.label).toBe('各国文学（亚洲）');
    expect(resolveClc('I561.45').level2?.label).toBe('各国文学（欧洲）');
    expect(resolveClc('I712.45').level2?.label).toBe('各国文学（美洲）');
    expect(resolveClc('D771.2').level2?.label).toBe('各国政治（美洲）');
  });

  it('类号深度不足时逐级回退，不做猜测', () => {
    expect(resolveClc('B-53').level1?.code).toBe('B');
    expect(resolveClc('B-53').level2).toBeNull();
    expect(resolveClc('').level1).toBeNull();
    expect(resolveClc('索书号').level1).toBeNull();
    // L 不是中图法使用的大类
    expect(resolveClc('L123').level1).toBeNull();
  });

  it('返回值即字段语义：level1 恒为 22 大类之一', () => {
    const level1Codes = new Set(CLC_LEVEL1.map(entry => entry.code));
    for (const sample of SAMPLES) {
      const path = resolveClc(sample.callNumber);
      expect(path.level1).not.toBeNull();
      expect(level1Codes.has(path.level1!.code)).toBe(true);
    }
  });
});

describe('clc / 表覆盖 22 大类', () => {
  it('22 个大类全部收录且都有非空类目名', () => {
    expect(CLC_LEVEL1).toHaveLength(22);
    for (const entry of CLC_LEVEL1) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.code).toMatch(/^[A-Z]$/);
    }
    // 中图法不使用 L / M / W / Y，22 大类即 A–Z 减去这四个字母
    expect(CLC_LEVEL1.map(entry => entry.code).sort().join('')).toBe('ABCDEFGHIJKNOPQRSTUVXZ');
  });

  it('每个大类都能认出自己（未来新增数据的兜底能力）', () => {
    for (const entry of CLC_LEVEL1) {
      expect(resolveClc(entry.code).level1?.code).toBe(entry.code);
      // 大类 + 任意数字都应归到该大类，而不是落空
      expect(resolveClc(`${entry.code}99`).level1?.code).toBe(entry.code);
    }
  });

  it('T 类 16 个二级全部收录，且每个都能下沉到三级', () => {
    const secondLevel = new Set<string>();
    for (let i = 0; i < 26; i += 1) {
      const code = `T${String.fromCharCode(65 + i)}`;
      const path = resolveClcCode(code);
      if (path.level2) secondLevel.add(path.level2.code);
    }
    expect(secondLevel.size).toBe(16);

    // 每个二级各取一个真实存在的三级类号做探针（注意 TJ 没有 TJ1、TH 的三级是 TH11 起的四字符码）
    const probes: Record<string, string> = {
      TB: 'TB3',
      TD: 'TD8',
      TE: 'TE1',
      TF: 'TF5',
      TG: 'TG2',
      TH: 'TH13',
      TJ: 'TJ2',
      TK: 'TK4',
      TL: 'TL3',
      TM: 'TM3',
      TN: 'TN3',
      TP: 'TP311',
      TQ: 'TQ32',
      TS: 'TS97',
      TU: 'TU98',
      TV: 'TV6'
    };
    for (const [parent, probe] of Object.entries(probes)) {
      const path = resolveClcCode(probe);
      expect(path.level2?.code).toBe(parent);
      expect(path.level3?.code).toBe(probe);
    }
  });
});

describe('clc / 校验与匹配', () => {
  it('isKnownClcCode 只认真实类号（路由层用它拦下永远匹配不上的输入）', () => {
    expect(isKnownClcCode('K')).toBe(true);
    expect(isKnownClcCode('k81')).toBe(true);
    expect(isKnownClcCode('TP3')).toBe(true);
    expect(isKnownClcCode('K83')).toBe(true);
    // 切片伪类目不是类号
    expect(isKnownClcCode('B51')).toBe(false);
    expect(isKnownClcCode('I10')).toBe(false);
    expect(isKnownClcCode('ZZ')).toBe(false);
    expect(isKnownClcCode('')).toBe(false);
  });

  it('类号跳转时靠祖先链命中二级（G519 教育史归 G4 教育）', () => {
    const g519 = resolveClc('G519/6248');
    expect(g519.level2?.code).toBe('G4');
    expect(g519.level2?.label).toBe('教育');
    // 前缀匹配在类号跳转时失效（'G519' 不以 'G4' 开头），必须靠祖先链补上
    expect(g519.code.startsWith('G4')).toBe(false);
    expect(matchesClc(g519, new Set(['G4']))).toBe(true);
    expect(matchesClc(g519, new Set(['G']))).toBe(true);
    expect(matchesClc(g519, new Set(['G51']))).toBe(true);
    expect(matchesClc(g519, new Set(['G61']))).toBe(false);
  });

  it('matchesClc 支持一级 / 二级 / 三级任一粒度', () => {
    const k835 = resolveClc('K835.615.6');
    expect(matchesClc(k835, new Set(['K']))).toBe(true);
    expect(matchesClc(k835, new Set(['K83']))).toBe(true);
    expect(matchesClc(k835, new Set(['K81']))).toBe(false);
    expect(matchesClc(k835, new Set(['B']))).toBe(false);
    // 空集合 = 不过滤
    expect(matchesClc(k835, new Set())).toBe(true);

    const tp311 = resolveClc('TP311.5');
    expect(matchesClc(tp311, new Set(['T']))).toBe(true);
    expect(matchesClc(tp311, new Set(['TP']))).toBe(true);
    expect(matchesClc(tp311, new Set(['TP3']))).toBe(true);
    expect(matchesClc(tp311, new Set(['TP311']))).toBe(true);
    expect(matchesClc(tp311, new Set(['TS']))).toBe(false);
  });

  it('虚构判定基于一级类 I（软偏好与硬过滤共用同一来源）', () => {
    expect(isFictionClc(resolveClc('I247.5'))).toBe(true);
    expect(isFictionClc(resolveClc('K835.615.6'))).toBe(false);
    expect(isFictionClc(resolveClc(''))).toBe(false);
  });

  it('无法识别的索书号返回同一份冻结空路径（不每次分配）', () => {
    expect(resolveClc('')).toBe(resolveClc('索书号'));
    expect(Object.isFrozen(resolveClc(''))).toBe(true);
  });
});
