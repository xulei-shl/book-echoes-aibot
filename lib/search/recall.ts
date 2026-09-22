import { matchesClc } from './clc';
import { LANE_LIMIT } from './config';
import { rrfFuse } from './fusion';
import { isFictionDoc } from './rank';
import type { RecallLane, RecallResult, SearchDoc, SearchFilters } from './types';

export interface RecallContext {
  /** 原句 → 稠密 lane */
  raw: string;
  /** 降噪后的 term → 词法 lane */
  core: string[];
  filters?: SearchFilters;
  /** 融合后取多少（K ≤ 40） */
  limit: number;
  /** 下推给 lane 的允许集合；null / undefined 表示无硬条件 */
  allow?: ReadonlySet<string> | null;
}

export type DocFilter = (doc: SearchDoc) => boolean;

/**
 * 把 `SearchFilters` 编译成单个判定函数：闭包内**一次性**建好类目 `Set`，
 * 不会每本书重新分配（万级语料下这是能否称为「廉价」的分水岭）。
 *
 * **全模块唯一的硬条件判定**：下推到 lane（`buildAllowSet`）与融合后兜底（`applyFilters`）
 * 共用它，所以「先过滤」与「后过滤」不可能出现两套标准。
 * 无任何条件时返回 `null` —— 调用方据此走零开销的直通路径。
 */
export function compileDocFilter(filters?: SearchFilters): DocFilter | null {
  const minRating = filters?.minRating;
  const pubYearFrom = filters?.pubYearFrom;
  const excludeFiction = filters?.excludeFiction === true;
  const callClasses =
    filters?.callClasses && filters.callClasses.length > 0
      ? new Set(filters.callClasses.map(code => code.trim().toUpperCase()))
      : null;

  if (
    minRating === undefined &&
    pubYearFrom === undefined &&
    !excludeFiction &&
    callClasses === null
  ) {
    return null;
  }

  return doc => {
    // 评分未知（0）的书不因评分条件被误删 —— 与出版年同一套豁免。
    // 实测全馆 98 本无评分，其中 2025 年后出版的 270 本里有 95 本（35%）是新书还没来得及评分，
    // 没有这条豁免时「2025 年以后 + 评分 8 分以上」会把它们静默删掉。
    // 评测框架（evals/lib/run.ts::computeViolations）用的也是这条豁免。
    if (minRating !== undefined && doc.numeric.rating > 0 && doc.numeric.rating < minRating) {
      return false;
    }
    // 出版年未知的书不因年份条件被误删
    if (
      pubYearFrom !== undefined &&
      doc.numeric.pubYear > 0 &&
      doc.numeric.pubYear < pubYearFrom
    ) {
      return false;
    }
    // 虚构类由索书号可判定，无「未知即豁免」问题
    if (excludeFiction && isFictionDoc(doc)) return false;
    if (callClasses !== null && !matchesClc(doc.clc, callClasses)) return false;
    return true;
  };
}

/**
 * 把**请求期即可确定**的硬条件（原句规则 + API 显式传参）编译成允许集合，下推给两条 lane。
 *
 * 为什么值得下推：lane 各自只取 `LANE_LIMIT` 条，若**先截断再过滤**，一个筛选性强的条件
 * （如「2025 年后」+「K 类」）会把两路各自的前 N 名大部分滤掉，融合后候选不足 ——
 * 用户看到的是「馆藏里没有」。下推只改变**截断与过滤的先后**，不改变判定本身。
 *
 * 成本一次 O(N) 遍历（10 000 本 ≈ 亚毫秒）；无硬条件时返回 `null`，零开销。
 * 模型档位推出的条件**不在此列**：它与 lane 结果并发返回，只能融合后补过滤。
 */
export function buildAllowSet(corpus: SearchDoc[], filters?: SearchFilters): Set<string> | null {
  const passes = compileDocFilter(filters);
  if (!passes) return null;
  const allow = new Set<string>();
  for (const doc of corpus) {
    if (passes(doc)) allow.add(doc.id);
  }
  return allow;
}

export function applyFilters(
  results: RecallResult[],
  docs: Map<string, SearchDoc>,
  filters?: SearchFilters
): RecallResult[] {
  const passes = compileDocFilter(filters);
  if (!passes) return results;
  return results.filter(result => {
    const doc = docs.get(result.docId);
    return doc !== undefined && passes(doc);
  });
}

/** 每条 lane 并发取结果；某条失败不影响另一条（返回空数组）。 */
export async function recallLanes(
  ctx: Pick<RecallContext, 'raw' | 'core' | 'allow'>,
  lanes: RecallLane[]
): Promise<RecallResult[][]> {
  const settled = await Promise.allSettled(
    lanes.map(lane =>
      lane.search({ raw: ctx.raw, core: ctx.core, limit: LANE_LIMIT, allow: ctx.allow })
    )
  );
  return settled.map(result => (result.status === 'fulfilled' ? result.value : []));
}

/** RRF 融合 → 过滤 → 截断 top-K。wide 作为第三条 lane 时直接追加进 `laneResults`。 */
export function fuseAndFilter(
  laneResults: RecallResult[][],
  docs: Map<string, SearchDoc>,
  filters: SearchFilters | undefined,
  limit: number
): RecallResult[] {
  return applyFilters(rrfFuse(laneResults), docs, filters).slice(0, limit);
}

/** 两条 lane 并发的便捷入口。 */
export async function recall(
  ctx: RecallContext,
  lanes: RecallLane[],
  docs: Map<string, SearchDoc>
): Promise<RecallResult[]> {
  const laneResults = await recallLanes(ctx, lanes);
  return fuseAndFilter(laneResults, docs, ctx.filters, ctx.limit);
}
