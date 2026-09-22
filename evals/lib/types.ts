import type { SearchFilters } from '@/lib/search/types';

/**
 * 评测集的数据契约。
 *
 * 设计原则：**每条用例都带着「真值从哪来」**（`truthSource`）。自动生成的用例靠语料自身推导
 * 正确答案（书名/作者/数值字段），人标的用例必须写明标注人与复核状态 —— 两者的可信度不同，
 * 报表里必须能分开看，不能混成一个平均数。
 */

/** 查询分层：按系统的已知失败模式切，而不是随机凑数 */
export type Stratum =
  /** 概念/情绪/场景 —— 稠密 lane 与档位判别 */
  | 'concept'
  /** 作品/作者 —— 精确命中、词法 lane */
  | 'work'
  /** 硬条件 —— plan.applied 与 applyFilters */
  | 'constraint'
  /** 条件陷阱（否定 / 上界）—— 守卫不能反向执行 */
  | 'constraint-trap'
  /** 词面陷阱（同名不同书等） */
  | 'trap'
  /** 显式标识（完整书名 / ISBN / 索书号 / 条码）—— 本地权威直通 */
  | 'exact';

export type ConstraintField = 'pubYearFrom' | 'minRating' | 'excludeFiction';

export interface QueryCase {
  id: string;
  stratum: Stratum;
  query: string;
  mode: 'fast' | 'deep';
  /** 冻结的「今天」：相对时间类查询（「近三年」）靠它保持可复现，否则标签会逐年腐烂 */
  frozenNow: string;
  /** 期望真正生效的硬条件（比对 `intent.plan.applied`） */
  expectApplied?: Partial<Record<ConstraintField, number | boolean>>;
  /** 期望**不**生效的硬条件（被守卫拦下或压根没解析出来） */
  expectNotApplied?: ConstraintField[];
  expectAbstain?: boolean;
  /** 期望走精确命中分支（0 次 Jev） */
  expectBasedOnExact?: boolean;
  /** 分值标注：docId → 0..3（与生产 FIT_LEVELS 同一把尺子） */
  labels: Record<string, number>;
  /** 自动真值的推导方式（人复查时一眼看懂为什么它是正确答案） */
  truthSource: string;
  /** 仅供报表展示的观察项（不作为断言，避免脆性） */
  observations?: string[];
}

/** 一条用例跑完后的观测结果 */
export interface CaseOutcome {
  case: QueryCase;
  basedOn: 'exact' | 'retrieval' | 'error';
  abstained: boolean;
  /** results + more 的 docId 顺序（喂给指标函数） */
  ranked: string[];
  /** 每本书的 fit（0..1），用于档位误差 */
  fits: Record<string, number | null>;
  applied: Partial<Record<ConstraintField, number | boolean>>;
  droppedCount: number;
  degraded: string[];
  /** 违反硬条件的书（必须为 0） */
  violations: string[];
  judgeCalls: number;
  timingMs: number;
  error?: string;
}

/** 评测集允许出现的降级码：离线跑时稠密 lane 被刻意关闭，不算异常 */
export const EXPECTED_DEGRADED = new Set(['dense-unavailable']);

export type { SearchFilters };
