import { CALL_CLASS_L1_KEY, CALL_CLASS_L2_KEY, buildClassRequest, buildUnderstandRequest } from '@/lib/jev/questions';
import {
  RATING_FLOOR_VALUES,
  RECENCY_LEVELS,
  STYLE_LEVELS,
  WIDER_RECALL_LEVELS,
  YEAR_FLOOR_VALUES,
  nearestLevelValue,
  normalizeLevel
} from './levels';
import { getLogger } from '@/src/utils/logger';
import { resolveClcCode } from './clc';
import {
  FALLBACK_LONG_QUERY_CHARS,
  FALLBACK_WIDER_RECALL_LONG,
  FALLBACK_WIDER_RECALL_SHORT
} from './tuning';
import { resolveClassKey } from './options';
import type { ClassOptionMap, ClassOptionSets } from './options';
import type { IntentType, JudgeFn, QueryFacets, SearchFilters } from './types';

/**
 * 阶段 ①（意图与口味）与阶段 ①b（类目判断）。
 *
 * 两者都是「调 Jev → 把标量回填到本地对象」，且**各自独立失败**（分别推送自己的
 * degraded code）。放在一起是因为它们共享同一套「模型答什么就只信什么」的回填纪律；
 * 与编排分开是因为它们的失败语义是自包含的，编排只需要知道 failed 与耗时。
 *
 * 共同铁律：模型只挑 id / 只打分，本地只接受标量、枚举与档位，绝不采信字符串。
 */

const logger = getLogger('search.understand');

/** 中性口味：模型不可用时使用，所有偏好贡献为 0。 */
const NEUTRAL_FACETS: QueryFacets = {
  wantsFiction: 0.5,
  wantsRecent: 0.5,
  avoidTheory: 0.5,
  wantsVerified: 0.5
};

export const neutralFacets = (): QueryFacets => ({ ...NEUTRAL_FACETS });

// ── 阶段 ①：意图与口味 ───────────────────────────────────────────────────────
export interface Understanding {
  type: IntentType;
  confidence: number;
  needsWiderRecall: number;
  facets: QueryFacets;
  /** 模型档位题推出的年份/评分条件（尚未决定是否升级成硬过滤）；类目不在此列（见 `ClassReading`） */
  modelConstraints: SearchFilters;
  /** `constraint_strictness`：模型认为这些条件是硬条件的概率 */
  strictness: number;
  /** `negation_present`：句中有否定/排除表达的概率 */
  negation: number;
}

export async function understand(
  query: string,
  corpusSize: number,
  judge: JudgeFn,
  model: string,
  signal?: AbortSignal
): Promise<{ value: Understanding; failed: boolean; ms: number }> {
  const started = Date.now();
  try {
    const request = buildUnderstandRequest(query, corpusSize, model);
    const result = await judge(request, signal);
    const intentAnswer = result.answers.intent;
    const noul = (key: string, fallback: number): number => {
      const answer = result.answers[key];
      return answer && answer.type === 'noul' ? answer.noul : fallback;
    };
    /** 档位题 → [0,1] 连续偏好（档位数由问题表决定，跨题可比） */
    const levelPreference = (key: string, levels: readonly unknown[], fallback: number): number => {
      const answer = result.answers[key];
      return answer && answer.type === 'score' ? normalizeLevel(answer.score, levels.length) : fallback;
    };
    /** 档位题 → 离散档位取值（如年份/评分下限表格） */
    const levelBucket = (key: string, values: readonly number[]): number => {
      const answer = result.answers[key];
      return answer && answer.type === 'score' ? nearestLevelValue(answer.score, values) : 0;
    };

    const genre = result.answers.genre_preference;
    const genreChoice = genre && genre.type === 'choice' ? genre.choice : null;
    const wantsFiction = genreChoice === 'fiction' ? 1 : genreChoice === 'nonfiction' ? 0 : 0.5;
    // 只有 `nonfiction` 才能升级成硬排除。
    // 「**只要**虚构」不走这里 —— `callClasses: ['I']` 已经能表达（`isFictionClc` 判的就是 I 类），
    // 所以虚构维度缺的一直是「排除」这一个方向。
    const excludeFiction = genreChoice === 'nonfiction';

    const yearFloor = levelBucket('year_floor', YEAR_FLOOR_VALUES);
    const ratingFloor = levelBucket('rating_floor', RATING_FLOOR_VALUES);

    return {
      value: {
        type:
          intentAnswer && intentAnswer.type === 'choice'
            ? (intentAnswer.choice as IntentType)
            : 'other',
        confidence: intentAnswer && intentAnswer.type === 'choice' ? intentAnswer.confidence : 0,
        needsWiderRecall: levelPreference('needs_wider_recall', WIDER_RECALL_LEVELS, 0),
        facets: {
          wantsFiction,
          wantsRecent: levelPreference('recency_preference', RECENCY_LEVELS, 0.5),
          // 风格档位越高越偏理论，而 facet 的语义是「越通俗越好」，所以取反
          avoidTheory: 1 - levelPreference('style_preference', STYLE_LEVELS, 0.5),
          wantsVerified: noul('wants_verified', 0.5)
        },
        modelConstraints: {
          ...(yearFloor > 0 ? { pubYearFrom: yearFloor } : {}),
          ...(ratingFloor > 0 ? { minRating: ratingFloor } : {}),
          ...(excludeFiction ? { excludeFiction: true } : {})
        },
        strictness: noul('constraint_strictness', 0),
        negation: noul('negation_present', 0)
      },
      failed: false,
      ms: Date.now() - started
    };
  } catch (error) {
    logger.error('understandQuery 失败，召回照常进行', {
      message: error instanceof Error ? error.message : String(error)
    });
    return {
      value: {
        type: 'other',
        confidence: 0,
        // 启发式：长句更可能需要语义宽召回（阈值见 tuning.ts）
        needsWiderRecall:
          query.length >= FALLBACK_LONG_QUERY_CHARS
            ? FALLBACK_WIDER_RECALL_LONG
            : FALLBACK_WIDER_RECALL_SHORT,
        facets: { ...NEUTRAL_FACETS },
        // 模型不可用时不猜任何硬条件
        modelConstraints: {},
        strictness: 0,
        negation: 0
      },
      failed: true,
      ms: Date.now() - started
    };
  }
}

// ── 阶段 ①b：类目判断（独立请求，与意图 / 召回并发）────────────────────────────
export interface ClassReading {
  /** 合并后的类号（尚未过否定门与「字面证据优先」门）；缺省 = 不设类目条件 */
  callClasses?: string[];
  /** 本请求自己的 `negation_present`：否定门不回头依赖意图请求 */
  negation: number;
}

/**
 * 两级类目题的合并规则：**退回较粗的 l1**。
 *
 * | l1 | l2 | 结果 | 理由 |
 * |---|---|---|---|
 * | `__none__` | 任意 | 不设条件 | 一级题已在说「不是在按类目筛」；二级题多半是照着主题词猜的，采信它会误删 |
 * | X | `__none__` / 与 X 不同源 | X | 两级不一致 = 模型不确定 → 取更粗的，宁可不过滤也不误删 |
 * | X | X 下的具体类 | 具体类 | 唯一「更精确且可信」的情形 |
 *
 * 「同源」统一用 `resolveClcCode(...).level1`（查表）判定，不靠字符串切前缀 ——
 * T 类的二级是 `TB`/`TP`/`TU` 这类双字母，切片会错。
 */
function mergeClassReading(level1?: string, detail?: string): string[] | undefined {
  if (level1 === undefined) return undefined;
  if (detail !== undefined && resolveClcCode(detail).level1?.code === level1) return [detail];
  return [level1];
}

export async function understandClass(
  query: string,
  sets: ClassOptionSets,
  judge: JudgeFn,
  model: string,
  signal?: AbortSignal
): Promise<{ value: ClassReading; failed: boolean; ms: number }> {
  const started = Date.now();
  try {
    const built = buildClassRequest(query, sets, model);
    const result = await judge(built.request, signal);
    /** `resolveClassKey` 是唯一还原点：`__none__` 与未知 key 一律 undefined */
    const pick = (key: string, map: ClassOptionMap): string | undefined => {
      const answer = result.answers[key];
      return answer && answer.type === 'choice' ? resolveClassKey(map, answer.choice) : undefined;
    };
    const callClasses = mergeClassReading(
      pick(CALL_CLASS_L1_KEY, built.level1Map),
      pick(CALL_CLASS_L2_KEY, built.detailMap)
    );
    const negationAnswer = result.answers.negation_present;
    return {
      value: {
        ...(callClasses !== undefined ? { callClasses } : {}),
        negation: negationAnswer && negationAnswer.type === 'noul' ? negationAnswer.noul : 0
      },
      failed: false,
      ms: Date.now() - started
    };
  } catch (error) {
    logger.error('类目判断失败，年份/评分条件照常生效', {
      message: error instanceof Error ? error.message : String(error)
    });
    // 失败即不设类目条件；否定取 0（此时没有任何类目条件可被它启用）
    return { value: { negation: 0 }, failed: true, ms: Date.now() - started };
  }
}
