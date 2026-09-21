import { RRF_K } from './config';
import type { RecallResult } from './types';

/**
 * Reciprocal Rank Fusion：不要求两路分数可比，只用名次，是最稳的默认。
 *
 * score(d) = Σ_lane 1 / (k + rank_lane(d))     k = 60（标准默认）
 */
export function rrfFuse(lanes: RecallResult[][], options: { k?: number } = {}): RecallResult[] {
  const k = options.k ?? RRF_K;
  const merged = new Map<string, RecallResult>();

  for (const lane of lanes) {
    lane.forEach((item, index) => {
      const contribution = 1 / (k + index + 1);
      const existing = merged.get(item.docId);
      if (!existing) {
        merged.set(item.docId, {
          docId: item.docId,
          score: contribution,
          lanes: [...item.lanes],
          matched: [...item.matched],
          laneScores: { ...item.laneScores }
        });
        return;
      }
      existing.score += contribution;
      for (const laneId of item.lanes) {
        if (!existing.lanes.includes(laneId)) existing.lanes.push(laneId);
      }
      for (const term of item.matched) {
        if (!existing.matched.includes(term)) existing.matched.push(term);
      }
      for (const [laneId, value] of Object.entries(item.laneScores)) {
        existing.laneScores[laneId] = Math.max(existing.laneScores[laneId] ?? 0, value);
      }
    });
  }

  return [...merged.values()].sort((a, b) => b.score - a.score || a.docId.localeCompare(b.docId));
}
