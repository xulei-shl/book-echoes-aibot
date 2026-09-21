import { LANE_LIMIT } from './config';
import { rrfFuse } from './fusion';
import type { RecallLane, RecallResult, SearchDoc, SearchFilters } from './types';

export interface RecallContext {
  /** 原句 → 稠密 lane */
  raw: string;
  /** 降噪后的 term → 词法 lane */
  core: string[];
  filters?: SearchFilters;
  /** 融合后取多少（K ≤ 40） */
  limit: number;
}

export function applyFilters(
  results: RecallResult[],
  docs: Map<string, SearchDoc>,
  filters?: SearchFilters
): RecallResult[] {
  if (!filters || (filters.minRating === undefined && filters.pubYearFrom === undefined)) {
    return results;
  }
  return results.filter(result => {
    const doc = docs.get(result.docId);
    if (!doc) return false;
    if (filters.minRating !== undefined && doc.numeric.rating < filters.minRating) return false;
    // 出版年未知的书不因该过滤器被误删
    if (
      filters.pubYearFrom !== undefined &&
      doc.numeric.pubYear > 0 &&
      doc.numeric.pubYear < filters.pubYearFrom
    ) {
      return false;
    }
    return true;
  });
}

/** 每条 lane 并发取结果；某条失败不影响另一条（返回空数组）。 */
export async function recallLanes(
  ctx: Pick<RecallContext, 'raw' | 'core'>,
  lanes: RecallLane[]
): Promise<RecallResult[][]> {
  const settled = await Promise.allSettled(
    lanes.map(lane => lane.search({ raw: ctx.raw, core: ctx.core, limit: LANE_LIMIT }))
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
