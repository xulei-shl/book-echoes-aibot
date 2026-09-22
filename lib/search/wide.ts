import { buildWideRequest } from '@/lib/jev/questions';
import { FIT_LEVELS, normalizeLevel } from './levels';
import { forceFastAbove, maxShards, wideShardSize } from './config';
import { budget } from './judge-cache';
import { NONE_KEY } from './options';
import { chunk } from './util';
import type { JudgeFn, RecallResult, SearchDoc } from './types';

/**
 * 阶段 ②：`deep` 模式的全库分片语义扫描。
 *
 * 这是**唯一**随馆藏规模线性增长的 Jev 开销（§4.5 层 3），因此三道闸门都在这里：
 * 语料上限、分片数上限、进程级每分钟预算 —— 任一超限都只降级（记 `degraded`），不中断检索。
 */

/** 片内取多少本并入候选池。片级 `shard_fit` 档位分是跨片可比信号，片内概率只在片内可比。 */
const SHARD_TOP_N = 5;

export async function runWide(
  query: string,
  corpus: SearchDoc[],
  /** 已由代码硬过滤保证的条件（人类可读）—— 只能是**确定性**那一层，见调用点注释 */
  enforced: readonly string[],
  judge: JudgeFn,
  model: string,
  degraded: string[],
  signal?: AbortSignal
): Promise<{ results: RecallResult[]; ms: number }> {
  const started = Date.now();
  if (corpus.length > forceFastAbove()) {
    degraded.push('wide-skipped');
    return { results: [], ms: 0 };
  }
  const shards = chunk(corpus, wideShardSize());
  if (shards.length > maxShards()) {
    degraded.push('wide-limit');
    return { results: [], ms: 0 };
  }
  if (!budget.tryConsume(shards.length)) {
    degraded.push('wide-budget');
    return { results: [], ms: 0 };
  }

  const settled = await Promise.allSettled(
    shards.map(shard => {
      const { request } = buildWideRequest(query, shard, enforced, model);
      return judge(request, signal).then(result => ({ result, shard }));
    })
  );

  const results: RecallResult[] = [];
  let failed = 0;
  for (const entry of settled) {
    if (entry.status === 'rejected') {
      failed += 1;
      continue;
    }
    const { result, shard } = entry.value;
    const answer = result.answers.pick;
    if (!answer || answer.type !== 'choice') {
      failed += 1;
      continue;
    }
    // pick = __none__ 胜出的片整片丢弃
    if (answer.choice === NONE_KEY) continue;
    const fitAnswer = result.answers.shard_fit;
    const shardFit =
      fitAnswer && fitAnswer.type === 'score'
        ? normalizeLevel(fitAnswer.score, FIT_LEVELS.length)
        : null;
    shard
      .map((doc, index) => ({ doc, probability: answer.probabilities[`b${index}`] ?? 0 }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, SHARD_TOP_N)
      .forEach(item => {
        // 档位题缺失时退回片内概率（跨片不可比，但至少不丢这批候选）
        const score = shardFit ?? item.probability;
        results.push({
          docId: item.doc.id,
          score,
          lanes: ['wide'],
          matched: [],
          laneScores: { wide: score }
        });
      });
  }

  if (failed > 0) degraded.push(`wide:${failed}`);
  // 跨片按贴合度排序：此前按分片顺序拼接，RRF 名次实际由分片下标决定
  results.sort((a, b) => b.score - a.score || a.docId.localeCompare(b.docId));
  return { results, ms: Date.now() - started };
}
