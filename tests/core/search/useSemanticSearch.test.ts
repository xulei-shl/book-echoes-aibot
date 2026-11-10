import { describe, it, expect } from 'vitest';
import {
  searchReducer,
  initialSearchState,
  type SearchState,
  type HitPreview
} from '@/components/search/useSemanticSearch';
import type { SemanticSearchResponse } from '@/lib/search/types';

const mockHit: HitPreview = {
  index: 0,
  total: 10,
  book: { title: '测试图书', author: '作者', coverUrl: 'https://example.com/cover.jpg' },
  relevancePct: 92
};

const mockResultsResponse: SemanticSearchResponse = {
  query: '测试',
  mode: 'fast',
  results: [],
  more: [],
  abstained: false,
  degraded: []
};

const mockAbstainedResponse: SemanticSearchResponse = {
  query: '测试',
  mode: 'fast',
  results: [],
  more: [],
  abstained: true,
  abstainReason: 'out_of_domain',
  degraded: []
};

describe('searchReducer State Machine', () => {
  it('starts in idle state', () => {
    expect(initialSearchState).toEqual({ status: 'idle' });
  });

  it('transitions idle -> searching on START_SEARCH', () => {
    const next = searchReducer(initialSearchState, { type: 'START_SEARCH' });
    expect(next).toEqual({
      status: 'searching',
      stage: null,
      stageInfo: null,
      hits: []
    });
  });

  it('updates stage and stageInfo during searching', () => {
    const searchingState: SearchState = {
      status: 'searching',
      stage: null,
      stageInfo: null,
      hits: []
    };

    const next = searchReducer(searchingState, {
      type: 'SET_PHASE',
      stage: 'scanning',
      stageInfo: { corpusSize: 500 }
    });

    expect(next).toEqual({
      status: 'searching',
      stage: 'scanning',
      stageInfo: { corpusSize: 500 },
      hits: []
    });
  });

  it('accumulates unique hits during searching', () => {
    const searchingState: SearchState = {
      status: 'searching',
      stage: 'scanning',
      stageInfo: null,
      hits: []
    };

    const stateWithOne = searchReducer(searchingState, { type: 'ADD_HIT', hit: mockHit });
    expect(stateWithOne.status === 'searching' && stateWithOne.hits.length).toBe(1);

    // Duplicate hit should be ignored
    const stateWithDup = searchReducer(stateWithOne, { type: 'ADD_HIT', hit: mockHit });
    expect(stateWithDup.status === 'searching' && stateWithDup.hits.length).toBe(1);
  });

  it('transitions searching -> results when done with normal results', () => {
    const searchingState: SearchState = {
      status: 'searching',
      stage: 'reranking',
      stageInfo: null,
      hits: [mockHit]
    };

    const next = searchReducer(searchingState, { type: 'DONE', response: mockResultsResponse });
    expect(next).toEqual({
      status: 'results',
      response: mockResultsResponse,
      hits: [mockHit]
    });
  });

  it('transitions searching -> abstained when done with abstained results', () => {
    const searchingState: SearchState = {
      status: 'searching',
      stage: 'reranking',
      stageInfo: null,
      hits: []
    };

    const next = searchReducer(searchingState, { type: 'DONE', response: mockAbstainedResponse });
    expect(next).toEqual({
      status: 'abstained',
      response: mockAbstainedResponse,
      hits: []
    });
  });

  it('transitions to error on FAIL', () => {
    const searchingState: SearchState = {
      status: 'searching',
      stage: 'scanning',
      stageInfo: null,
      hits: []
    };

    const next = searchReducer(searchingState, { type: 'FAIL', error: '连接超时' });
    expect(next).toEqual({
      status: 'error',
      error: '连接超时'
    });
  });

  it('transitions error -> idle on CLEAR_ERROR', () => {
    const errorState: SearchState = {
      status: 'error',
      error: '网络异常'
    };

    const next = searchReducer(errorState, { type: 'CLEAR_ERROR' });
    expect(next).toEqual({ status: 'idle' });
  });

  it('resets any state to idle on RESET', () => {
    const resultsState: SearchState = {
      status: 'results',
      response: mockResultsResponse,
      hits: [mockHit]
    };

    expect(searchReducer(resultsState, { type: 'RESET' })).toEqual({ status: 'idle' });
  });

  it('ignores out-of-order SET_PHASE or ADD_HIT when not in searching state', () => {
    const idleState: SearchState = { status: 'idle' };

    const ignoredPhase = searchReducer(idleState, {
      type: 'SET_PHASE',
      stage: 'scanning',
      stageInfo: {}
    });
    expect(ignoredPhase).toBe(idleState);

    const ignoredHit = searchReducer(idleState, { type: 'ADD_HIT', hit: mockHit });
    expect(ignoredHit).toBe(idleState);
  });
});
