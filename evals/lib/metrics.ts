/**
 * 评测指标（纯函数，无副作用、无网络）。
 *
 * 与设计方案 §10.4 的两处更新：
 * 1. `fit` 已从 noul 概率换成 **rerank 档位归一化值**，所以不再用 Brier，改算**档位误差**
 *    （MAE 与「±1 档内占比」）—— 尺子与 `FIT_LEVELS` 一致，直接可比；
 * 2. 档位是有序的，所以排序指标用**分级增益**的 nDCG（gain = 2^level − 1），
 *    二值 precision 会把「部分相关」和「直接回应」当成同一件事。
 */

/** 视为「相关」的最低档位（2 = 部分相关） */
export const RELEVANT_MIN_LEVEL = 2;

const gain = (level: number): number => 2 ** level - 1;

export function dcgAt(ranked: string[], labels: Record<string, number>, k: number): number {
  let dcg = 0;
  const limit = Math.min(k, ranked.length);
  for (let i = 0; i < limit; i += 1) {
    const level = labels[ranked[i]] ?? 0;
    if (level <= 0) continue;
    dcg += gain(level) / Math.log2(i + 2);
  }
  return dcg;
}

/** 理想排序（按标注档位降序）下的 DCG，作为归一化分母 */
export function idcgAt(labels: Record<string, number>, k: number): number {
  const levels = Object.values(labels)
    .filter(level => level > 0)
    .sort((a, b) => b - a)
    .slice(0, k);
  let idcg = 0;
  levels.forEach((level, index) => {
    idcg += gain(level) / Math.log2(index + 2);
  });
  return idcg;
}

/** nDCG@k；没有任何标注相关书时返回 null（不做分母，避免把「无解查询」算成 0 分） */
export function nDCGAt(ranked: string[], labels: Record<string, number>, k: number): number | null {
  const idcg = idcgAt(labels, k);
  if (idcg === 0) return null;
  return dcgAt(ranked, labels, k) / idcg;
}

/** 召回率：标注相关的书里有多少进了前 k；无相关标注时返回 null */
export function recallAt(
  ranked: string[],
  labels: Record<string, number>,
  k: number,
  minLevel = RELEVANT_MIN_LEVEL
): number | null {
  const relevant = Object.entries(labels)
    .filter(([, level]) => level >= minLevel)
    .map(([docId]) => docId);
  if (relevant.length === 0) return null;
  const top = new Set(ranked.slice(0, k));
  const hit = relevant.filter(docId => top.has(docId)).length;
  return hit / relevant.length;
}

/** 首条是否为相关书；无相关标注时返回 null */
export function top1IsRelevant(
  ranked: string[],
  labels: Record<string, number>,
  minLevel = RELEVANT_MIN_LEVEL
): boolean | null {
  const hasRelevant = Object.values(labels).some(level => level >= minLevel);
  if (!hasRelevant) return null;
  if (ranked.length === 0) return false;
  return (labels[ranked[0]] ?? 0) >= minLevel;
}

export interface GradePair {
  /** 模型给的档位位置（0..档数-1），缺失记 null */
  fitPosition: number | null;
  /** 人工/语料标注的档位 */
  level: number;
}

export interface GradeError {
  /** 平均绝对档位误差 */
  mae: number | null;
  /** 误差 ≤ 1 档的占比 */
  withinOne: number | null;
  /** 样本数 */
  count: number;
}

/** 档位误差：取代原来的 fit Brier（fit 已不是概率） */
export function gradeError(pairs: GradePair[]): GradeError {
  const usable = pairs.filter((pair): pair is { fitPosition: number; level: number } =>
    pair.fitPosition !== null
  );
  if (usable.length === 0) return { mae: null, withinOne: null, count: 0 };
  const total = usable.reduce((sum, pair) => sum + Math.abs(pair.fitPosition - pair.level), 0);
  const within = usable.filter(pair => Math.abs(pair.fitPosition - pair.level) <= 1).length;
  return { mae: total / usable.length, withinOne: within / usable.length, count: usable.length };
}

export interface AbstainPair {
  expectAbstain: boolean;
  abstained: boolean;
}

export interface AbstainScore {
  /** 全部用例的判对比例 */
  accuracy: number | null;
  /** 该答却弃权（漏召回）—— 最伤用户的一类错 */
  falseAbstainRate: number | null;
  /** 该弃权却给了结果（硬凑） */
  falseAnswerRate: number | null;
}

export function abstainScore(pairs: AbstainPair[]): AbstainScore {
  if (pairs.length === 0) return { accuracy: null, falseAbstainRate: null, falseAnswerRate: null };
  const correct = pairs.filter(pair => pair.expectAbstain === pair.abstained).length;
  const answerable = pairs.filter(pair => !pair.expectAbstain);
  const unanswerable = pairs.filter(pair => pair.expectAbstain);
  return {
    accuracy: correct / pairs.length,
    falseAbstainRate:
      answerable.length === 0
        ? null
        : answerable.filter(pair => pair.abstained).length / answerable.length,
    falseAnswerRate:
      unanswerable.length === 0
        ? null
        : unanswerable.filter(pair => !pair.abstained).length / unanswerable.length
  };
}

/**
 * 硬条件执行的违规率：被放行的书里有多少本该被条件挡掉。
 * 分母是「结果 + more」的全量候选，所以**精确率**的口径是「放行集合里违规的比例」。
 */
export function constraintViolationRate(violations: string[], ranked: string[]): number | null {
  if (ranked.length === 0) return null;
  return violations.length / ranked.length;
}

/** 平均：跳过 null，保证「无样本」不会被当成 0 分 */
export function mean(values: (number | null)[]): number | null {
  const usable = values.filter((value): value is number => value !== null);
  if (usable.length === 0) return null;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

export const formatPct = (value: number | null, digits = 1): string =>
  value === null ? '—' : `${(value * 100).toFixed(digits)}%`;

export const formatNum = (value: number | null, digits = 3): string =>
  value === null ? '—' : value.toFixed(digits);
