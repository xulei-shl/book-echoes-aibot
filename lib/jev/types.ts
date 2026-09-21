/** Jev（TypeSafe System One）HTTP 契约类型。 */

export type Instructions = string | Record<string, unknown>;

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
  criteria: Record<string, string | null>;
}

export type Question = NoulQuestion | ChoiceQuestion;

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

export type Answer = NoulAnswer | ChoiceAnswer;

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
