import { buildRerankRequest, fitsKey } from '@/lib/jev/questions';
import { FIT_LEVELS, normalizeLevel } from './levels';
import { RERANK_BATCH } from './config';
import { budget } from './judge-cache';
import { NONE_KEY } from './options';
import { chunk } from './util';
import type { JudgeFn, SearchDoc } from './types';

/**
 * 阶段 ③：逐本精排（O(K)，与馆藏规模无关）。
 *
 * `fits::bN` 是**逐本独立**打分的档位题，因此「部分相关」与「直接回应」能区分开 ——
 * 这正是它能当弃权门的原因（`choice(best)` 的互斥分布做不到，见 `rank.ts::eligibility`）。
 * 整批失败时返回 `ok: false`，由编排走「保留召回结果、ranked=false 沉底」的降级路径。
 */

export interface RerankOutcome {
  ok: boolean;
  pNone: number;
  batchHasMatch: boolean | null;
  bestProbability: number[];
  /** 归一化适配度 = score / (档数-1) ∈ [0,1]，缺失记 null */
  fits: (number | null)[];
  /** 原始档位（0..3），供 UI 直接展示「按哪一档判的」 */
  fitLevels: (number | null)[];
  /** 档位答案的置信度 */
  fitConfidences: (number | null)[];
}

export async function runRerank(
  query: string,
  candidates: SearchDoc[],
  /** 已由代码硬过滤保证的条件（人类可读），精排据此不必再判它们 */
  enforced: readonly string[],
  judge: JudgeFn,
  model: string,
  degraded: string[],
  signal?: AbortSignal
): Promise<RerankOutcome> {
  const bestProbability = new Array<number>(candidates.length).fill(0);
  const fits = new Array<number | null>(candidates.length).fill(null);
  const fitLevels = new Array<number | null>(candidates.length).fill(null);
  const fitConfidences = new Array<number | null>(candidates.length).fill(null);

  const empty: RerankOutcome = {
    ok: false,
    pNone: 0,
    batchHasMatch: null,
    bestProbability,
    fits,
    fitLevels,
    fitConfidences
  };

  if (candidates.length === 0) return empty;

  const batches = chunk(candidates, RERANK_BATCH);
  if (!budget.tryConsume(batches.length)) {
    degraded.push('rerank-budget');
    return empty;
  }

  const settled = await Promise.allSettled(
    batches.map(batch => judge(buildRerankRequest(query, batch, enforced, model).request, signal))
  );

  let pNone = 0;
  let succeeded = 0;
  let failed = 0;
  const batchHasMatchValues: boolean[] = [];

  settled.forEach((entry, batchIndex) => {
    const offset = batchIndex * RERANK_BATCH;
    const batch = batches[batchIndex];
    if (entry.status === 'rejected') {
      failed += 1;
      return;
    }
    succeeded += 1;
    const answers = entry.value.answers;
    const best = answers.best;
    if (best && best.type === 'choice') {
      pNone = Math.max(pNone, best.probabilities[NONE_KEY] ?? 0);
      batch.forEach((_, index) => {
        bestProbability[offset + index] = best.probabilities[`b${index}`] ?? 0;
      });
    }
    batch.forEach((_, index) => {
      const answer = answers[fitsKey(index)];
      if (answer && answer.type === 'score') {
        fits[offset + index] = normalizeLevel(answer.score, FIT_LEVELS.length);
        fitLevels[offset + index] = Math.round(answer.score);
        fitConfidences[offset + index] = answer.confidence;
      }
    });
    const batchHasMatch = answers.batch_has_match;
    if (batchHasMatch && batchHasMatch.type === 'noul') {
      batchHasMatchValues.push(batchHasMatch.noul > 0.5);
    }
  });

  if (failed > 0) degraded.push(`rerank:${failed}`);
  return {
    ok: succeeded > 0,
    pNone,
    batchHasMatch: batchHasMatchValues.length === 0 ? null : batchHasMatchValues.some(Boolean),
    bestProbability,
    fits,
    fitLevels,
    fitConfidences
  };
}
