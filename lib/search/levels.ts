/**
 * Jev `score` 题的**档位表**（唯一来源）。
 *
 * 级号 = 数组下标；`criteria` 原样送给模型，本地用同一张表把返回的档位位置映射回代码里的阈值。
 * 档位描述一律写「情境」而不写「程度」—— 官方明确模型看不到级号、也看不到相邻级。
 *
 * 为什么单独成文件：档位表被两侧同时消费 ——
 * 出题侧（`lib/jev/questions.ts` 组装 `criteria`）与判定侧（检索的过滤、门控、排序、展示）。
 * 若它挂在出题侧，判定侧就得反向依赖 `lib/jev`，把「本地阈值」绑在「HTTP 契约」上；
 * 放在这里则两侧都只依赖一份纯数据。
 */

// ── 召回与口味 ──────────────────────────────────────────────────────────────
/** 需要语义扩张的程度：0 档 = 字面足够，越高越需要宽召回 / 查询扩展。 */
export const WIDER_RECALL_LEVELS = [
  'query 的核心词很可能直接出现在书名、作者或内容简介里',
  'query 含情绪、场景或具体经历的描述，相关书可能只有部分词重合',
  'query 是抽象概念或生活处境，相关书很可能完全不用这些词出现在书名或简介里'
] as const;

/** 新鲜度偏好：0 档 = 不限年代。 */
export const RECENCY_LEVELS = [
  '不限年代，经典与新书同样可能相关',
  '偏好较新出版的书（近十年）',
  '偏好近年出版的书（近五年）',
  '只要最近出版的新书（近两年）'
] as const;

/** 风格偏好：0 档 = 越通俗越好（对应 avoidTheory 高），2 档 = 偏好理论。 */
export const STYLE_LEVELS = [
  '偏好通俗、好读、少术语的书',
  '不限风格，通俗与学术都可以',
  '偏好理论性、学术性较强的书'
] as const;

// ── 硬条件档位（级号 → 实际取值）────────────────────────────────────────────
/** 出版年下限档位：级号 → 年份。0 = 没有要求。 */
export const YEAR_FLOOR_LEVELS = [
  '没有年份要求',
  '2000 年以后出版',
  '2010 年以后出版',
  '2015 年以后出版',
  '2020 年以后出版'
] as const;
export const YEAR_FLOOR_VALUES = [0, 2000, 2010, 2015, 2020] as const;

/** 评分下限档位：级号 → 分数。0 = 没有要求。 */
export const RATING_FLOOR_LEVELS = ['没有评分要求', '7 分以上', '8 分以上', '9 分以上'] as const;
export const RATING_FLOOR_VALUES = [0, 7, 8, 9] as const;

// ── 逐本适配度（门控与排序共用）────────────────────────────────────────────
/**
 * 单本候选与 query 的关系档位。语义与 `relevancePct` 同源：
 * `fit = score / (length - 1)`，所以 1 档 ≈ 0.33、2 档 ≈ 0.67、3 档 = 1.0。
 */
export const FIT_LEVELS = [
  '与 query 无关，或只是词面相同（同词异义、同名不同书、同名作者）',
  '主题邻接，但不是 query 所问的问题本身',
  '部分相关：讨论同一主题，但只是全书若干主题之一，或只是其中一章',
  '直接回应 query 描述的主题、情绪或问题'
] as const;

// ── 档位位置换算 ────────────────────────────────────────────────────────────
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** 档位位置 → [0,1]。跨题组合前必须做这一步（不同题档位数不同）。 */
export function normalizeLevel(score: number, levelCount: number): number {
  if (!Number.isFinite(score) || levelCount < 2) return 0;
  return clamp01(score / (levelCount - 1));
}

/** 档位位置 → 最近的离散档位取值（`score` 可以落在两级之间）。 */
export function nearestLevelValue(score: number, values: readonly number[]): number {
  if (!Number.isFinite(score) || values.length === 0) return values[0] ?? 0;
  const index = Math.round(Math.min(values.length - 1, Math.max(0, score)));
  return values[index] ?? 0;
}

/** 档位位置 → 最近的档位描述，供 UI 展示「模型按哪一档判的」。 */
export function nearestLevelLabel(score: number, levels: readonly string[]): string {
  if (levels.length === 0) return '';
  const index = Math.round(Math.min(levels.length - 1, Math.max(0, score)));
  return levels[index] ?? '';
}
