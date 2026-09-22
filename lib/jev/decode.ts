import { JevProtocolError } from './errors';
import type { Answer, Question, SystemOneResponse, TokenUsage } from './types';

/** 选项数 ≤ 50，比 SkillRanker 的 0.1 收紧。 */
const SUM_TOLERANCE = 0.05;
/** score 题目的档位数区间（官方：至少 2 级，最多 10 级）。 */
const SCORE_LEVEL_MIN = 2;
const SCORE_LEVEL_MAX = 10;
/**
 * `score = Σ(级号 × 概率)` 是官方给出的确定性公式，所以档位位置可以被严格校验。
 * 容差同时用作「档位位置越界」的允许误差。
 */
const SCORE_TOLERANCE = 0.05;

/** 级号键：`['0', '1', …, n-1]`（score 的 probabilities / legend 都按级号索引，而非标签）。 */
const levelKeysFor = (levels: number): string[] =>
  Array.from({ length: levels }, (_, index) => String(index));

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isUnitNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

/** 缺失的用量按 null 记账，不当作 0。 */
function decodeUsage(raw: unknown): TokenUsage {
  const usage = isPlainObject(raw) ? raw : {};
  const read = (value: unknown): number | null =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
  return { input_tokens: read(usage.input_tokens), output_tokens: read(usage.output_tokens) };
}

function sameKeySet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((key, index) => key === sortedB[index]);
}

/**
 * 严格解码：任一规则不满足即抛 JevProtocolError，调用方整次降级。
 * 校验规则见设计方案 §5.2。
 */
export function decodeResponse(
  raw: unknown,
  questions: Record<string, Question>,
  model: string
): SystemOneResponse {
  if (!isPlainObject(raw)) {
    throw new JevProtocolError('响应不是对象');
  }
  if (!isPlainObject(raw.answers)) {
    throw new JevProtocolError('响应缺少 answers');
  }
  // ① answers 的 key 集合必须与请求 questions 完全相等
  if (!sameKeySet(Object.keys(questions), Object.keys(raw.answers))) {
    throw new JevProtocolError('answers 的 key 集合与请求 questions 不一致');
  }

  const answers: Record<string, Answer> = {};

  for (const [key, question] of Object.entries(questions)) {
    const answer = raw.answers[key];
    if (!isPlainObject(answer)) {
      throw new JevProtocolError(`答案 ${key} 不是对象`);
    }
    // ② answer.type 必须与 question.type 一致
    if (answer.type !== question.type) {
      throw new JevProtocolError(`答案 ${key} 的 type 与问题不一致`);
    }

    if (question.type === 'noul') {
      // ④ noul ∈ [0,1] 有限数
      if (!isUnitNumber(answer.noul)) {
        throw new JevProtocolError(`答案 ${key} 的 noul 不是 [0,1] 内的有限数`);
      }
      answers[key] = { type: 'noul', noul: answer.noul };
      continue;
    }

    if (question.type === 'score') {
      const levels = question.criteria;
      if (!Array.isArray(levels) || levels.length < SCORE_LEVEL_MIN || levels.length > SCORE_LEVEL_MAX) {
        throw new JevProtocolError(
          `问题 ${key} 的 score criteria 必须是 ${SCORE_LEVEL_MIN}–${SCORE_LEVEL_MAX} 个档位的数组`
        );
      }
      const levelKeys = levelKeysFor(levels.length);
      if (!isPlainObject(answer.probabilities)) {
        throw new JevProtocolError(`答案 ${key} 缺少 probabilities`);
      }
      if (!sameKeySet(levelKeys, Object.keys(answer.probabilities))) {
        throw new JevProtocolError(`答案 ${key} 的档位概率键必须是 0..${levels.length - 1}`);
      }
      let sum = 0;
      let expected = 0;
      const probabilities: Record<string, number> = {};
      for (const levelKey of levelKeys) {
        const value = answer.probabilities[levelKey];
        if (!isUnitNumber(value)) {
          throw new JevProtocolError(`答案 ${key} 的档位概率 ${levelKey} 不在 [0,1] 内`);
        }
        probabilities[levelKey] = value;
        sum += value;
        expected += Number(levelKey) * value;
      }
      if (Math.abs(sum - 1) > SUM_TOLERANCE) {
        throw new JevProtocolError(`答案 ${key} 的档位概率和越界：${sum}`);
      }
      // ⑤ score 必须等于 Σ(级号 × 概率)：公式是确定的，不自洽即协议错误
      if (
        typeof answer.score !== 'number' ||
        !Number.isFinite(answer.score) ||
        answer.score < -SCORE_TOLERANCE ||
        answer.score > levels.length - 1 + SCORE_TOLERANCE
      ) {
        throw new JevProtocolError(`答案 ${key} 的 score 越界`);
      }
      if (Math.abs(answer.score - expected) > SCORE_TOLERANCE) {
        throw new JevProtocolError(`答案 ${key} 的 score 与档位概率不自洽`);
      }
      if (!isUnitNumber(answer.confidence)) {
        throw new JevProtocolError(`答案 ${key} 的 confidence 不在 [0,1] 内`);
      }
      if (!isPlainObject(answer.legend) || !sameKeySet(levelKeys, Object.keys(answer.legend))) {
        throw new JevProtocolError(`答案 ${key} 的 legend 档位键必须是 0..${levels.length - 1}`);
      }
      answers[key] = {
        type: 'score',
        score: answer.score,
        confidence: answer.confidence,
        legend: answer.legend,
        probabilities
      };
      continue;
    }

    // ③ choice：option key 集合必须与 criteria 完全相等
    const criteriaKeys = Object.keys(question.criteria);
    if (!isPlainObject(answer.probabilities)) {
      throw new JevProtocolError(`答案 ${key} 缺少 probabilities`);
    }
    if (!sameKeySet(criteriaKeys, Object.keys(answer.probabilities))) {
      throw new JevProtocolError(`答案 ${key} 的 option key 与 criteria 不一致`);
    }

    let sum = 0;
    let argmax = '';
    let argmaxValue = Number.NEGATIVE_INFINITY;
    const probabilities: Record<string, number> = {};
    for (const option of criteriaKeys) {
      const value = answer.probabilities[option];
      if (!isUnitNumber(value)) {
        throw new JevProtocolError(`答案 ${key} 的概率 ${option} 不在 [0,1] 内`);
      }
      probabilities[option] = value;
      sum += value;
      if (value > argmaxValue) {
        argmaxValue = value;
        argmax = option;
      }
    }
    if (Math.abs(sum - 1) > SUM_TOLERANCE) {
      throw new JevProtocolError(`答案 ${key} 的概率和越界：${sum}`);
    }
    if (typeof answer.choice !== 'string' || answer.choice !== argmax) {
      throw new JevProtocolError(`答案 ${key} 的 choice 不是概率分布的 argmax`);
    }
    if (!isUnitNumber(answer.confidence)) {
      throw new JevProtocolError(`答案 ${key} 的 confidence 不在 [0,1] 内`);
    }

    answers[key] = {
      type: 'choice',
      choice: answer.choice,
      probabilities,
      confidence: answer.confidence
    };
  }

  const returnedModel = typeof raw.model === 'string' && raw.model.length > 0 ? raw.model : model;
  return { model: returnedModel, answers, usage: decodeUsage(raw.usage) };
}
