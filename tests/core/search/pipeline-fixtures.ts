import { CALL_CLASS_L1_KEY, CALL_CLASS_L2_KEY } from '@/lib/jev/questions';
import {
  FIT_LEVELS,
  RATING_FLOOR_LEVELS,
  RECENCY_LEVELS,
  STYLE_LEVELS,
  WIDER_RECALL_LEVELS,
  YEAR_FLOOR_LEVELS
} from '@/lib/search/levels';
import { NONE_KEY } from '@/lib/search/options';
import { resolveClc } from '@/lib/search/clc';
import type { Answer, SystemOneRequest, SystemOneResult } from '@/lib/jev/types';
import type { IntentType, JudgeFn, SearchDoc } from '@/lib/search/types';

/**
 * pipeline 端到端测试的共享夹具：语料、自洽的答案构造器、以及**按 questions 生成答案的桩模型**。
 *
 * 抽成模块的理由：这些是「模型说什么」的唯一来源。桩一旦与真实契约漂移，
 * 所有用例都会一起失真 —— 放在一处才能一眼看全它对四种请求（意图 / 类目 / wide / 精排）的应答。
 * 测试文件本身只留断言。
 *
 * 桩刻意保持可复现：不发网络、不看时钟、答案完全由 `StubOptions` 决定。
 */

export function makeDoc(
  id: string,
  title: string,
  reason: string,
  overrides: { rating?: number; pubYear?: number; callNumber?: string } = {}
): SearchDoc {
  const rating = overrides.rating ?? 8.2;
  const pubYear = overrides.pubYear ?? 2020;
  const callNumber = overrides.callNumber ?? 'B842.6';
  return {
    id,
    sourceId: '2026-06',
    book: {
      id,
      month: '2026-06',
      title,
      author: '某作者',
      publisher: '某出版社',
      pubYear: String(pubYear),
      pages: '200',
      rating: String(rating),
      callNumber,
      callNumberLink: '',
      isbn: `isbn-${id}`,
      recommendation: '',
      summary: `${title} 的内容简介`,
      authorIntro: '',
      catalog: '',
      coverUrl: ''
    },
    fields: {
      title,
      subtitle: '',
      author: '某作者',
      translator: '',
      publisher: '某出版社',
      subjects: callNumber,
      reason,
      summary: `${title} 的内容简介`,
      toc: ''
    },
    exact: { isbn: `isbn-${id}`, barcode: id, callNumber },
    clc: resolveClc(callNumber),
    numeric: { rating, pubYear, pages: 200 },
    hash: id
  };
}

export const corpus: SearchDoc[] = [
  makeDoc('d1', '焦虑的意义', '存在主义心理学专著', { pubYear: 2024, rating: 8.5 }),
  makeDoc('d2', '焦虑与自由', '哲学随笔'),
  makeDoc('d3', '生活的焦虑', '日常心理', { pubYear: 2023, rating: 7.5 }),
  makeDoc('d4', '焦虑时代', '社会学观察', { pubYear: 2018, rating: 6.5 })
];

export const noul = (value: number): Answer => ({ type: 'noul', noul: value });

export const choice = (
  probabilities: Record<string, number>,
  chosen: string,
  confidence = 0.8
): Answer => ({ type: 'choice', choice: chosen, probabilities, confidence });

/**
 * 构造自洽的 score 回答：把档位位置拆到相邻两级上，
 * 与 decode 的「score = Σ 级号 × 概率」校验一致。
 */
export const score = (levelCount: number, position: number, confidence = 0.8): Answer => {
  const lower = Math.floor(position);
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
    probabilities[String(lower)] = 1 - (position - lower);
    probabilities[String(upper)] = position - lower;
  }
  return { type: 'score', score: position, confidence, legend, probabilities };
};

/** 0..1 的偏好 → 某张档位表上的位置 */
export const levelAt = (levels: readonly unknown[], preference: number): number =>
  preference * (levels.length - 1);

export interface StubOptions {
  understand?: 'ok' | 'fail';
  /** 意图 choice 胜出的类型（默认 concept） */
  intentType?: IntentType;
  /** 精排批级 noul `batch_has_match` 的值（默认 0.9 = true） */
  batchHasMatch?: number;
  /** `genre_preference` 胜出的类型（默认 any） */
  genre?: 'fiction' | 'any' | 'nonfiction';
  /** 返回每本候选的 fit（0..1）；'fail' 表示整批失败 */
  rerank?: 'ok' | 'fail' | ((index: number) => number);
  pNone?: number;
  bestProbabilities?: (index: number) => number;
  needsWiderRecall?: number;
  widePick?: 'none' | 'top';
  /** 模型给出的年份档位（0 = 没有要求） */
  yearFloor?: number;
  /** 模型给出的评分档位（0 = 没有要求） */
  ratingFloor?: number;
  /** 模型认为「这是硬条件」的概率 */
  strictness?: number;
  /** 句中含否定表达的概率 */
  negation?: number;
  /** 片级贴合档位（按片内标题决定），跨片可比 */
  wideFitByShard?: (titles: string[]) => number;
  /** 类目请求：`call_class_l1` 挑中的大类号（如 `K`）；缺省 = 答 `__none__` */
  classL1?: string;
  /** 类目请求：`call_class_l2` 挑中的具体类号（如 `K92`）；缺省 = 答 `__none__` */
  classL2?: string;
  /** 类目请求整次失败（测「只丢类目、其余条件不受影响」） */
  class?: 'ok' | 'fail';
  /** **类目请求自己的**否定概率（与 `negation` 分属两次请求，刻意分开） */
  classNegation?: number;
}

export function makeJudge(options: StubOptions = {}) {
  const calls: SystemOneRequest[] = [];
  const judge: JudgeFn = async (request): Promise<SystemOneResult> => {
    calls.push(request);
    const keys = Object.keys(request.questions);
    const answers: Record<string, Answer> = {};

    /**
     * 按「类号 」前缀在 criteria 里找 key；找不到即 `__none__` ——
     * 与真实的 `resolveClassKey` 一样，模型编不出表里没有的类号。
     */
    const classChoice = (questionKey: string, code?: string): Answer => {
      const criteria = (request.questions[questionKey]?.criteria ?? {}) as Record<
        string,
        string | null
      >;
      const all = Object.keys(criteria);
      const chosen = code
        ? (all.find(key => (criteria[key] ?? '').startsWith(`${code} `)) ?? NONE_KEY)
        : NONE_KEY;
      const others = all.filter(key => key !== chosen);
      const each = others.length > 0 ? 0.1 / others.length : 0;
      const probabilities: Record<string, number> = {};
      for (const key of all) probabilities[key] = key === chosen ? 0.9 : each;
      return choice(probabilities, chosen);
    };

    if (keys.includes('intent')) {
      if (options.understand === 'fail') throw new Error('understand failed');
      // choice 必须自洽：胜出项就是 argmax，概率和 = 1
      const intentType = options.intentType ?? 'concept';
      const intentProbabilities: Record<string, number> = {
        concept: 0.05,
        work: 0.05,
        similar: 0.05,
        list: 0.05,
        other: 0.05
      };
      intentProbabilities[intentType] = 0.8;
      answers.intent = choice(intentProbabilities, intentType);
      answers.needs_wider_recall = score(
        WIDER_RECALL_LEVELS.length,
        levelAt(WIDER_RECALL_LEVELS, options.needsWiderRecall ?? 0.2)
      );
      const genreChoice = options.genre ?? 'any';
      const genreProbabilities: Record<string, number> = {
        fiction: 0.1,
        any: 0.1,
        nonfiction: 0.1
      };
      genreProbabilities[genreChoice] = 0.8;
      answers.genre_preference = choice(genreProbabilities, genreChoice);
      answers.recency_preference = score(RECENCY_LEVELS.length, levelAt(RECENCY_LEVELS, 0.5));
      answers.style_preference = score(STYLE_LEVELS.length, levelAt(STYLE_LEVELS, 0.5));
      answers.wants_verified = noul(0.6);
      answers.year_floor = score(YEAR_FLOOR_LEVELS.length, options.yearFloor ?? 0);
      answers.rating_floor = score(RATING_FLOOR_LEVELS.length, options.ratingFloor ?? 0);
      answers.constraint_strictness = noul(options.strictness ?? 0);
      answers.negation_present = noul(options.negation ?? 0);
    } else if (keys.includes(CALL_CLASS_L1_KEY)) {
      // 类目判断是**独立的一次请求**：两级两题 + 自含的否定题
      if (options.class === 'fail') throw new Error('class failed');
      answers[CALL_CLASS_L1_KEY] = classChoice(CALL_CLASS_L1_KEY, options.classL1);
      answers[CALL_CLASS_L2_KEY] = classChoice(CALL_CLASS_L2_KEY, options.classL2);
      answers.negation_present = noul(options.classNegation ?? 0);
    } else if (keys.includes('pick')) {
      const shard = (request.state as { shard: { id: string; title: string }[] }).shard;
      if (options.widePick === 'top') {
        const probabilities: Record<string, number> = { __none__: 0.1 };
        shard.forEach((item, index) => {
          probabilities[item.id] = index === 0 ? 0.7 : 0.1;
        });
        answers.pick = choice(probabilities, shard[0].id);
      } else {
        const probabilities: Record<string, number> = { __none__: 0.9 };
        shard.forEach(item => {
          probabilities[item.id] = 0.1 / Math.max(1, shard.length);
        });
        answers.pick = choice(probabilities, '__none__');
      }
      answers.shard_fit = score(
        FIT_LEVELS.length,
        options.wideFitByShard ? options.wideFitByShard(shard.map(item => item.title)) : 0
      );
    } else {
      if (options.rerank === 'fail') throw new Error('rerank failed');
      const candidates = (request.state as { candidates: { id: string }[] }).candidates;
      const noneP = options.pNone ?? 0.1;
      const probabilities: Record<string, number> = { __none__: noneP };
      let remaining = 1 - noneP;
      candidates.forEach((item, index) => {
        const value = options.bestProbabilities
          ? options.bestProbabilities(index)
          : remaining / candidates.length;
        probabilities[item.id] = value;
        remaining -= value;
      });
      const argmax = Object.entries(probabilities).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      answers.best = choice(probabilities, argmax, 0.5);
      answers.batch_has_match = noul(options.batchHasMatch ?? 0.9);
      candidates.forEach((item, index) => {
        const fitFn = typeof options.rerank === 'function' ? options.rerank : () => 0.8;
        // 逐本用 score 档位（而不是 noul 是非题），fit = 档位位置 / (档数-1)
        answers[`fits::${item.id}`] = score(FIT_LEVELS.length, fitFn(index) * (FIT_LEVELS.length - 1));
      });
    }

    return {
      model: 'stub-1.0',
      answers,
      usage: { input_tokens: 100, output_tokens: 10 },
      requestedModel: 'stub',
      attempts: 1,
      roundTripMs: 1
    };
  };
  return { judge, calls };
}
