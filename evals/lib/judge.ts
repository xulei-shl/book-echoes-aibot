import {
  FIT_LEVELS,
  RATING_FLOOR_LEVELS,
  RECENCY_LEVELS,
  STYLE_LEVELS,
  WIDER_RECALL_LEVELS,
  YEAR_FLOOR_LEVELS
} from '@/lib/search/levels';
import type { Answer, SystemOneRequest, SystemOneResult } from '@/lib/jev/types';
import type { JudgeFn } from '@/lib/search/types';

/**
 * 评测用的 judge 层：把「模型怎么答」与「我们怎么算」彻底解耦。
 *
 * - `stubJudge`：完全离线、确定性的假模型。**刻意保持中性**（不产生任何模型侧硬条件），
 *   于是评测测到的是**规则层与本地算术**，而不是模型。可复现性来自这里。
 * - `recordJudge` / `replayJudge`：cassette 录制与回放。录一次真实答卷之后，
 *   所有本地阈值（fit 门控、facet 权重、RRF、BM25）都能离线扫，零 Jev 成本。
 *
 * 为什么强调「中性」：如果 stub 也给出年份/评分档位，那么一条「2015 年以后」的用例
 * 就分不清是规则层解析对了，还是 stub 恰好答对了 —— 自动真值必须只由规则层负责。
 */

const noul = (value: number): Answer => ({ type: 'noul', noul: value });

const choice = (probabilities: Record<string, number>, chosen: string, confidence = 0.8): Answer => ({
  type: 'choice',
  choice: chosen,
  probabilities,
  confidence
});

/** 构造自洽的 score 回答（与 decode 的 `score = Σ 级号 × 概率` 校验一致）。 */
const score = (levelCount: number, position: number, confidence = 0.8): Answer => {
  const clamped = Math.max(0, Math.min(levelCount - 1, position));
  const lower = Math.floor(clamped);
  const upper = Math.min(levelCount - 1, lower + 1);
  const probabilities: Record<string, number> = {};
  const legend: Record<string, unknown> = {};
  for (let i = 0; i < levelCount; i += 1) {
    probabilities[String(i)] = 0;
    legend[String(i)] = `第${i}档`;
  }
  if (lower === upper) {
    probabilities[String(lower)] = 1;
  } else {
    probabilities[String(lower)] = 1 - (clamped - lower);
    probabilities[String(upper)] = clamped - lower;
  }
  return { type: 'score', score: clamped, confidence, legend, probabilities };
};

export interface StubOptions {
  /** 每本候选的 fit（0..1）；缺省为中性 0.6（确保门控不会误删，测的是候选集合而非排序） */
  rerankFit?: (index: number) => number;
  pNone?: number;
  needsWiderRecall?: number;
  /** 模型给出的年份档位（0 = 没有要求）；自动真值用例必须保持 0 */
  yearFloor?: number;
  /** 模型给出的评分档位（0 = 没有要求） */
  ratingFloor?: number;
  wantNegation?: number;
  wantStrictness?: number;
  /** wide 选书：'none' 或 'top' */
  widePick?: 'none' | 'top';
}

export interface StubJudge {
  judge: JudgeFn;
  /** 收到的请求（用于断言「精确命中 0 次 Jev」） */
  calls: SystemOneRequest[];
}

export function stubJudge(options: StubOptions = {}): StubJudge {
  const calls: SystemOneRequest[] = [];
  const judge: JudgeFn = async (request): Promise<SystemOneResult> => {
    calls.push(request);
    const keys = Object.keys(request.questions);
    const answers: Record<string, Answer> = {};

    if (keys.includes('intent')) {
      answers.intent = choice(
        { concept: 0.7, work: 0.1, similar: 0.1, list: 0.05, other: 0.05 },
        'concept'
      );
      answers.needs_wider_recall = score(
        WIDER_RECALL_LEVELS.length,
        (options.needsWiderRecall ?? 0) * (WIDER_RECALL_LEVELS.length - 1)
      );
      answers.genre_preference = choice({ fiction: 0.1, any: 0.8, nonfiction: 0.1 }, 'any');
      answers.recency_preference = score(RECENCY_LEVELS.length, 1);
      answers.style_preference = score(STYLE_LEVELS.length, 1);
      answers.wants_verified = noul(0.5);
      answers.year_floor = score(YEAR_FLOOR_LEVELS.length, options.yearFloor ?? 0);
      answers.rating_floor = score(RATING_FLOOR_LEVELS.length, options.ratingFloor ?? 0);
      answers.constraint_strictness = noul(options.wantStrictness ?? 0);
      answers.negation_present = noul(options.wantNegation ?? 0);
    } else if (keys.includes('pick')) {
      const shard = (request.state as { shard: { id: string; title: string }[] }).shard;
      const probabilities: Record<string, number> = {};
      if (options.widePick === 'top' && shard.length > 0) {
        probabilities.__none__ = 0.1;
        shard.forEach((item, index) => {
          probabilities[item.id] = index === 0 ? 0.7 : 0.1;
        });
        answers.pick = choice(probabilities, shard[0].id);
        answers.shard_fit = score(FIT_LEVELS.length, 2);
      } else {
        probabilities.__none__ = 0.9;
        shard.forEach(item => {
          probabilities[item.id] = 0.1 / Math.max(1, shard.length);
        });
        answers.pick = choice(probabilities, '__none__');
        answers.shard_fit = score(FIT_LEVELS.length, 0);
      }
    } else {
      const candidates = (request.state as { candidates: { id: string }[] }).candidates;
      const noneP = options.pNone ?? 0.05;
      const probabilities: Record<string, number> = { __none__: noneP };
      // `best` 是「选一本」题：给首候选一个明确的胜出概率，让门控（best.p > p_none）
      // 走正常路径。若让它输给 `__none__`，整批都会被判 rejected ——
      // 那样测到的是 stub 的弃权艺术，而不是检索本身。
      const winner = candidates.length > 0 ? candidates[0].id : null;
      let remaining = 1 - noneP - (winner ? 0.6 : 0);
      if (winner) probabilities[winner] = 0.6;
      candidates.forEach((item, index) => {
        if (winner === item.id) return;
        const value = remaining / Math.max(1, candidates.length - index - 1);
        probabilities[item.id] = value;
        remaining -= value;
      });
      const argmax = Object.entries(probabilities).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      answers.best = choice(probabilities, argmax, 0.5);
      answers.batch_has_match = noul(0.9);
      candidates.forEach((item, index) => {
        const fit = options.rerankFit ? options.rerankFit(index) : 0.6;
        answers[`fits::${item.id}`] = score(FIT_LEVELS.length, fit * (FIT_LEVELS.length - 1));
      });
    }

    return {
      model: 'eval-stub-1.0',
      answers,
      usage: { input_tokens: 0, output_tokens: 0 },
      requestedModel: 'eval-stub',
      attempts: 1,
      roundTripMs: 0
    };
  };
  return { judge, calls };
}

// ── cassette：录制一次真实答卷，之后离线回放 ────────────────────────────────

export interface CassetteEntry {
  key: string;
  model: string;
  answers: Record<string, Answer>;
}

export interface Cassette {
  version: 1;
  recordedAt: string;
  entries: CassetteEntry[];
}

/**
 * 请求指纹：题目集合 + 选项集合 + 档位数。
 * 不含 `state`（书籍内容会随语料更新，指纹过严会让 cassette 立刻失效）。
 */
export function requestKey(request: SystemOneRequest): string {
  const parts = Object.keys(request.questions)
    .sort()
    .map(id => {
      const question = request.questions[id];
      if (question.type === 'score') return `${id}:score:${question.criteria.length}`;
      return `${id}:${question.type}:${Object.keys(question.criteria ?? {}).sort().join('|')}`;
    });
  return parts.join(';');
}

export function recordJudge(inner: JudgeFn, cassette: Cassette): JudgeFn {
  return async (request, signal) => {
    const result = await inner(request, signal);
    cassette.entries.push({ key: requestKey(request), model: result.model, answers: result.answers });
    return result;
  };
}

/** 回放：指纹命中即回放；未命中**直接报错**，绝不静默编造答案。 */
export function replayJudge(cassette: Cassette): StubJudge {
  const calls: SystemOneRequest[] = [];
  const judge: JudgeFn = async (request): Promise<SystemOneResult> => {
    calls.push(request);
    const key = requestKey(request);
    const entry = cassette.entries.find(item => item.key === key);
    if (!entry) {
      throw new Error(
        `cassette 未覆盖该请求指纹（${key}）。请重新录制，或改用 stubJudge —— 评测不允许静默兜底。`
      );
    }
    return {
      model: entry.model,
      answers: entry.answers,
      usage: { input_tokens: 0, output_tokens: 0 },
      requestedModel: 'eval-cassette',
      attempts: 1,
      roundTripMs: 0
    };
  };
  return { judge, calls };
}
