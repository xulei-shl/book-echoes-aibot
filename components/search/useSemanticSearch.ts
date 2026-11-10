'use client';

import { useCallback, useReducer, useState, useRef, useEffect } from 'react';
import type { SearchMode, SearchResultItem, SemanticSearchResponse } from '@/lib/search/types';
import { abstainCopyFor } from './abstainCopy';

/**
 * 显式检索状态机：`idle → searching → results / abstained / error → idle`。
 * 使用带区分联合类型（Discriminated Union）消除 impossible states。
 */

export type SearchView = 'idle' | 'searching' | 'results' | 'abstained' | 'error';

export type SearchStage = 'preparing' | 'scanning' | 'analyzed' | 'reranking' | null;

export interface StageInfo {
  terms?: string[];
  corpusSize?: number;
  intent?: string;
  confidence?: number;
  lexicalHits?: number;
  denseHits?: number;
  fusedCandidates?: number;
  candidateCount?: number;
}

export interface HitPreview {
  index: number;
  total: number;
  book: { title: string; author: string; coverUrl: string };
  relevancePct: number;
}

/** 显式状态联合类型定义 */
export type SearchState =
  | { status: 'idle' }
  | {
      status: 'searching';
      stage: SearchStage;
      stageInfo: StageInfo | null;
      hits: HitPreview[];
    }
  | {
      status: 'results';
      response: SemanticSearchResponse;
      hits: HitPreview[];
    }
  | {
      status: 'abstained';
      response: SemanticSearchResponse;
      hits: HitPreview[];
    }
  | {
      status: 'error';
      error: string;
    };

export type SearchAction =
  | { type: 'START_SEARCH' }
  | { type: 'SET_PHASE'; stage: SearchStage; stageInfo: StageInfo }
  | { type: 'ADD_HIT'; hit: HitPreview }
  | { type: 'DONE'; response: SemanticSearchResponse }
  | { type: 'FAIL'; error: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'RESET' };

export const initialSearchState: SearchState = { status: 'idle' };

export function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case 'START_SEARCH':
      return {
        status: 'searching',
        stage: null,
        stageInfo: null,
        hits: [],
      };

    case 'SET_PHASE':
      if (state.status !== 'searching') return state;
      return {
        ...state,
        stage: action.stage,
        stageInfo: action.stageInfo,
      };

    case 'ADD_HIT':
      if (state.status !== 'searching') return state;
      if (state.hits.some((h) => h.index === action.hit.index)) return state;
      return {
        ...state,
        hits: [...state.hits, action.hit],
      };

    case 'DONE':
      if (state.status !== 'searching') return state;
      return action.response.abstained
        ? { status: 'abstained', response: action.response, hits: state.hits }
        : { status: 'results', response: action.response, hits: state.hits };

    case 'FAIL':
      return {
        status: 'error',
        error: action.error,
      };

    case 'CLEAR_ERROR':
      return state.status === 'error' ? { status: 'idle' } : state;

    case 'RESET':
      return { status: 'idle' };

    default:
      return state;
  }
}

/** 首屏条数：搜索页不提供分页控件，更多结果走响应的 `more` 分区揭示（不触发新请求）。 */
const LIMIT = 12;

export function useSemanticSearch() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('fast');
  const [state, dispatch] = useReducer(searchReducer, initialSearchState);

  const abortRef = useRef<AbortController | null>(null);

  // 组件卸载时安全中断进行中的请求
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const submit = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    // 取消上一个进行中的请求
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    dispatch({ type: 'START_SEARCH' });

    try {
      const res = await fetch('/api/semantic-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/x-ndjson',
        },
        body: JSON.stringify({ query: trimmed, mode, limit: LIMIT, view: 'full' }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        dispatch({ type: 'FAIL', error: body?.error ?? '检索失败，请稍后重试' });
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      function handleEvent(event: { event: string; data: unknown }) {
        switch (event.event) {
          case 'phase': {
            const d = event.data as { stage: string; [k: string]: unknown };
            dispatch({
              type: 'SET_PHASE',
              stage: d.stage as SearchStage,
              stageInfo: d as StageInfo,
            });
            break;
          }
          case 'hit': {
            const hit = event.data as HitPreview;
            dispatch({ type: 'ADD_HIT', hit });
            break;
          }
          case 'done': {
            const data = event.data as SemanticSearchResponse;
            dispatch({ type: 'DONE', response: data });
            break;
          }
          case 'error': {
            const d = event.data as { message: string };
            dispatch({ type: 'FAIL', error: d.message });
            break;
          }
        }
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // 保留不完整的最后一行

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            handleEvent(event);
          } catch {
            /* 忽略解析失败的行 */
          }
        }
      }
      // 处理 buffer 中可能剩余的最后一行
      if (buffer.trim()) {
        try {
          handleEvent(JSON.parse(buffer));
        } catch {
          /* 忽略 */
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      dispatch({ type: 'FAIL', error: '网络异常，请稍后重试' });
    }
  }, [query, mode]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setQuery('');
    dispatch({ type: 'RESET' });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  // 显式状态派生字段，保持与消费组件完全兼容
  const view: SearchView = state.status;
  const response = state.status === 'results' || state.status === 'abstained' ? state.response : null;
  const error = state.status === 'error' ? state.error : null;
  const stage = state.status === 'searching' ? state.stage : null;
  const stageInfo = state.status === 'searching' ? state.stageInfo : null;
  const hits =
    state.status === 'searching' || state.status === 'results' || state.status === 'abstained'
      ? state.hits
      : [];

  return {
    query,
    mode,
    view,
    state,
    response,
    error,
    /** 检索枢纽是否已退让到顶部（非空闲态） */
    showTop: state.status !== 'idle',
    /** 详情面板可导航的结果：首屏 + 「加载更多」全部（`more` 已按相关度降序） */
    allItems: (response ? [...response.results, ...response.more] : []) as SearchResultItem[],
    /** 首屏命中的图书 id，供 3D 背景联动高亮 */
    matchedIds: response?.results.map((item) => item.book.id),
    abstainCopy: abstainCopyFor(response?.abstainReason),
    setQuery,
    setMode,
    submit,
    reset,
    clearError,
    // 流式进度状态
    stage,
    stageInfo,
    hits,
  };
}
