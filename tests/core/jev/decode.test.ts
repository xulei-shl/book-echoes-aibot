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

const fitLevels = ['无关', '主题邻接', '部分相关', '直接回应'];

const scoreQuestions: Record<string, Question> = {
  'fits::b0': { type: 'score', instructions: '与 query 的关系属于哪一档？', criteria: fitLevels }
};

const validScoreResponse = {
  model: 'jev-1.13.0',
  answers: {
    'fits::b0': {
      type: 'score',
      score: 2.52,
      confidence: 0.52,
      legend: { '0': '无关', '1': '主题邻接', '2': '部分相关', '3': '直接回应' },
      probabilities: { '0': 0, '1': 0, '2': 0.48, '3': 0.52 }
    }
  },
  usage: { input_tokens: 100, output_tokens: 12 }
};

describe('decodeResponse / score', () => {
  it('合法 score 回答通过，保留档位位置、置信度、legend 与概率', () => {
    const decoded = decodeResponse(validScoreResponse, scoreQuestions, 'jev-latest');
    expect(decoded.answers['fits::b0']).toEqual({
      type: 'score',
      score: 2.52,
      confidence: 0.52,
      legend: { '0': '无关', '1': '主题邻接', '2': '部分相关', '3': '直接回应' },
      probabilities: { '0': 0, '1': 0, '2': 0.48, '3': 0.52 }
    });
  });

  it('档位描述可以是结构化对象（官方 { what, examples }）', () => {
    const structured: Record<string, Question> = {
      fit: {
        type: 'score',
        instructions: '相关度',
        criteria: [{ what: '无关' }, { what: '相关' }]
      }
    };
    const response = {
      model: 'm',
      answers: {
        fit: {
          type: 'score',
          score: 1,
          confidence: 1,
          legend: { '0': { what: '无关' }, '1': { what: '相关' } },
          probabilities: { '0': 0, '1': 1 }
        }
      },
      usage: { input_tokens: 1, output_tokens: 1 }
    };
    expect(decodeResponse(response, structured, 'm').answers.fit).toMatchObject({ score: 1 });
  });

  it('criteria 不是数组、或档位数越界时抛错', () => {
    const notArray: Record<string, Question> = {
      fit: { type: 'score', instructions: 'x', criteria: { a: '甲', b: '乙' } } as unknown as Question
    };
    const oneLevel: Record<string, Question> = {
      fit: { type: 'score', instructions: 'x', criteria: ['唯一一级'] }
    };
    const elevenLevels: Record<string, Question> = {
      fit: {
        type: 'score',
        instructions: 'x',
        criteria: Array.from({ length: 11 }, (_, i) => `第${i}级`)
      }
    };
    for (const bad of [notArray, oneLevel, elevenLevels]) {
      expect(() => decodeResponse(validScoreResponse, bad, 'm')).toThrow(JevProtocolError);
    }
  });

  it('档位概率键必须恰好是 0..n-1', () => {
    const missingLevel = {
      ...validScoreResponse,
      answers: {
        'fits::b0': {
          ...validScoreResponse.answers['fits::b0'],
          probabilities: { '0': 0, '1': 0, '2': 1 }
        }
      }
    };
    expect(() => decodeResponse(missingLevel, scoreQuestions, 'm')).toThrow(JevProtocolError);
  });

  it('档位概率和越界时抛错', () => {
    const broken = {
      ...validScoreResponse,
      answers: {
        'fits::b0': {
          ...validScoreResponse.answers['fits::b0'],
          probabilities: { '0': 0, '1': 0.2, '2': 0.48, '3': 0.52 }
        }
      }
    };
    expect(() => decodeResponse(broken, scoreQuestions, 'm')).toThrow(JevProtocolError);
  });

  it('score 与档位概率不自洽时抛错（官方公式 score = Σ 级号 × 概率）', () => {
    const broken = {
      ...validScoreResponse,
      answers: {
        'fits::b0': { ...validScoreResponse.answers['fits::b0'], score: 1.2 }
      }
    };
    expect(() => decodeResponse(broken, scoreQuestions, 'm')).toThrow(JevProtocolError);
  });

  it('score 越界时抛错', () => {
    for (const value of [3.9, -0.4, Number.NaN, '2.5', undefined] as unknown[]) {
      const broken = {
        ...validScoreResponse,
        answers: {
          'fits::b0': { ...validScoreResponse.answers['fits::b0'], score: value }
        }
      };
      expect(() => decodeResponse(broken, scoreQuestions, 'm')).toThrow(JevProtocolError);
    }
  });

  it('confidence 越界、legend 档位键不全时抛错', () => {
    const badConfidence = {
      ...validScoreResponse,
      answers: {
        'fits::b0': { ...validScoreResponse.answers['fits::b0'], confidence: 1.4 }
      }
    };
    const badLegend = {
      ...validScoreResponse,
      answers: {
        'fits::b0': {
          ...validScoreResponse.answers['fits::b0'],
          legend: { '0': '无关', '1': '主题邻接' }
        }
      }
    };
    expect(() => decodeResponse(badConfidence, scoreQuestions, 'm')).toThrow(JevProtocolError);
    expect(() => decodeResponse(badLegend, scoreQuestions, 'm')).toThrow(JevProtocolError);
  });
});
