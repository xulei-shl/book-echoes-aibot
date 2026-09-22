/**
 * Jev（TypeSafe System One）HTTP 契约类型。
 *
 * 官方支持三种题型，本地三类都要落地（判据见官方 Score/Noul/Choice 文档）：
 * - `noul`：单一命题的真假（是不是 / 有没有）→ 返回该命题为真的概率。
 * - `choice`：无序的固定选项集合 → 返回选中项 + 各选项概率。
 * - `score`：**可描述成步骤的谱系上的位置** → 返回档位位置（可落在两级之间）、每档概率、置信度。
 *   程度类判断（相关度、口味强度、年份/评分档位）必须用 score，不能用 noul 硬压成是非题。
 */

/** 指令/标签/级描述：字符串，或对象、数组（官方支持结构化级描述，如 `{ what, examples }`）。 */
export type Instructions = string | Record<string, unknown> | unknown[];

export interface NoulCriteria {
  true?: Instructions;
  false?: Instructions;
}

export interface NoulQuestion {
  type: 'noul';
  instructions: Instructions;
  criteria?: NoulCriteria;
}

export interface ChoiceQuestion {
  type: 'choice';
  instructions: Instructions;
  criteria: Record<string, Instructions | null>;
}

/**
 * 有序档位题：`criteria` 是**数组**，级号 = 数组下标（官方接受 2–10 级）。
 * 每一级会被独立评估，模型看不到级号也看不到相邻级，所以要写「情境」而不是「程度」。
 */
export interface ScoreQuestion {
  type: 'score';
  instructions: Instructions;
  criteria: Instructions[];
}

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export interface NoulAnswer {
  type: 'noul';
  noul: number;
}

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface ScoreAnswer {
  type: 'score';
  /** 档位位置 = Σ(级号 × 概率)，可落在两级之间；上界为 criteria.length - 1 */
  score: number;
  /** 由概率在各级之间的分散程度计算：全部集中在一级为 1.0 */
  confidence: number;
  /** 级号 → 级描述（回显请求里的 criteria），供 UI 展示「模型按哪一档判的」 */
  legend: Record<string, unknown>;
  /** 级号 → 概率，和为 1 */
  probabilities: Record<string, number>;
}

export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export interface SystemOneRequest {
  model: string;
  state: unknown;
  questions: Record<string, Question>;
}

/** 缺失的用量按 null 记账，不当作 0（§5.2 第 5 条）。 */
export interface TokenUsage {
  input_tokens: number | null;
  output_tokens: number | null;
}

export interface SystemOneResponse {
  model: string;
  answers: Record<string, Answer>;
  usage: TokenUsage;
}

export interface SystemOneResult extends SystemOneResponse {
  /** 请求时使用的模型标识（别名 ≠ 不可变版本） */
  requestedModel: string;
  attempts: number;
  roundTripMs: number;
}
