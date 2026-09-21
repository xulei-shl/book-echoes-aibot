import { describe, expect, it } from 'vitest';
import { decodeResponse } from '@/lib/jev/decode';
import { JevProtocolError } from '@/lib/jev/errors';
import type { Question } from '@/lib/jev/types';

const questions: Record<string, Question> = {
  is_match: {
    type: 'noul',
    instructions: '是否相关？',
    criteria: { true: '是', false: '否' }
  },
  best: {
    type: 'choice',
    instructions: '哪一本最符合？',
    criteria: { b0: '《A》', b1: '《B》', __none__: '都不符合' }
  }
};

const validResponse = {
  model: 'jev-1.13.0',
  answers: {
    is_match: { type: 'noul', noul: 0.82 },
    best: {
      type: 'choice',
      choice: 'b0',
      probabilities: { b0: 0.6, b1: 0.1, __none__: 0.3 },
      confidence: 0.55
    }
  },
  usage: { input_tokens: 100, output_tokens: 12 }
};

describe('decodeResponse', () => {
  it('合法响应通过并保留 model / usage', () => {
    const decoded = decodeResponse(validResponse, questions, 'jev-latest');
    expect(decoded.model).toBe('jev-1.13.0');
    expect(decoded.usage).toEqual({ input_tokens: 100, output_tokens: 12 });
    expect(decoded.answers.is_match).toEqual({ type: 'noul', noul: 0.82 });
  });

  it('响应无 model 时回退到请求模型', () => {
    const decoded = decodeResponse({ ...validResponse, model: undefined }, questions, 'jev-latest');
    expect(decoded.model).toBe('jev-latest');
  });

  it('usage 缺失时记 null 而非 0', () => {
    const decoded = decodeResponse({ ...validResponse, usage: undefined }, questions, 'm');
    expect(decoded.usage).toEqual({ input_tokens: null, output_tokens: null });
  });

  it('缺少 answer 时抛 JevProtocolError', () => {
    const broken = {
      ...validResponse,
      answers: { is_match: validResponse.answers.is_match }
    };
    expect(() => decodeResponse(broken, questions, 'm')).toThrow(JevProtocolError);
  });

  it('多余 answer 时抛 JevProtocolError', () => {
    const broken = {
      ...validResponse,
      answers: { ...validResponse.answers, extra: { type: 'noul', noul: 0.5 } }
    };
    expect(() => decodeResponse(broken, questions, 'm')).toThrow(JevProtocolError);
  });

  it('type 与问题不一致时抛错', () => {
    const broken = {
      ...validResponse,
      answers: { ...validResponse.answers, is_match: { type: 'choice', choice: 'b0', probabilities: {}, confidence: 1 } }
    };
    expect(() => decodeResponse(broken, questions, 'm')).toThrow(JevProtocolError);
  });

  it('noul 非 [0,1] 有限数时抛错', () => {
    for (const value of [1.2, -0.1, Number.NaN, '0.5'] as unknown[]) {
      const broken = {
        ...validResponse,
        answers: { ...validResponse.answers, is_match: { type: 'noul', noul: value } }
      };
      expect(() => decodeResponse(broken, questions, 'm')).toThrow(JevProtocolError);
    }
  });

  it('option key 与 criteria 不一致时抛错', () => {
    const broken = {
      ...validResponse,
      answers: {
        ...validResponse.answers,
        best: {
          type: 'choice',
          choice: 'b0',
          probabilities: { b0: 0.7, b1: 0.3 },
          confidence: 0.5
        }
      }
    };
    expect(() => decodeResponse(broken, questions, 'm')).toThrow(JevProtocolError);
  });

  it('概率和越界时抛错', () => {
    const broken = {
      ...validResponse,
      answers: {
        ...validResponse.answers,
        best: {
          type: 'choice',
          choice: 'b0',
          probabilities: { b0: 0.9, b1: 0.4, __none__: 0.1 },
          confidence: 0.5
        }
      }
    };
    expect(() => decodeResponse(broken, questions, 'm')).toThrow(JevProtocolError);
  });

  it('choice 不是 argmax 时抛错', () => {
    const broken = {
      ...validResponse,
      answers: {
        ...validResponse.answers,
        best: {
          type: 'choice',
          choice: 'b1',
          probabilities: { b0: 0.6, b1: 0.1, __none__: 0.3 },
          confidence: 0.5
        }
      }
    };
    expect(() => decodeResponse(broken, questions, 'm')).toThrow(JevProtocolError);
  });

  it('confidence 越界时抛错', () => {
    const broken = {
      ...validResponse,
      answers: {
        ...validResponse.answers,
        best: { ...validResponse.answers.best, confidence: 1.5 }
      }
    };
    expect(() => decodeResponse(broken, questions, 'm')).toThrow(JevProtocolError);
  });

  it('answers 不是对象时抛错', () => {
    expect(() => decodeResponse({ answers: [] }, questions, 'm')).toThrow(JevProtocolError);
    expect(() => decodeResponse(null, questions, 'm')).toThrow(JevProtocolError);
  });
});
