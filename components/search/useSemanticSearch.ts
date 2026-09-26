'use client';

import { useCallback, useState, useRef } from 'react';
import type { SearchMode, SearchResultItem, SemanticSearchResponse } from '@/lib/search/types';
import { abstainCopyFor } from './abstainCopy';

/**
 * 检索状态机与请求：`idle → searching → results / abstained → idle`。
 * 支持 NDJSON 流式接收并返回详细的进度状态。
 */

export type SearchView = 'idle' | 'searching' | 'results' | 'abstained';

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

/** 首屏条数：搜索页不提供分页控件，更多结果走响应的 `more` 分区揭示（不触发新请求）。 */
const LIMIT = 12;

export function useSemanticSearch() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('fast');
  const [view, setView] = useState<SearchView>('idle');
  const [response, setResponse] = useState<SemanticSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [stage, setStage] = useState<SearchStage>(null);
  const [stageInfo, setStageInfo] = useState<StageInfo | null>(null);
  const [hits, setHits] = useState<HitPreview[]>([]);
  const [isStreamDone, setIsStreamDone] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const submit = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    
    // 取消上一个进行中的请求
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    
    setView('searching');
    setStage(null);
    setStageInfo(null);
    setHits([]);
    setIsStreamDone(false);
    setError(null);
    setResponse(null);
    
    try {
      const res = await fetch('/api/semantic-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/x-ndjson',
        },
        body: JSON.stringify({ query: trimmed, mode, limit: LIMIT }),
        signal: controller.signal,
      });
      
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        setError(body?.error ?? '检索失败，请稍后重试');
        setView('idle');
        return;
      }
      
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      function handleEvent(event: { event: string; data: unknown }) {
        switch (event.event) {
          case 'phase': {
            const d = event.data as { stage: string; [k: string]: unknown };
            setStage(d.stage as SearchStage);
            setStageInfo(d as StageInfo);
            break;
          }
          case 'hit': {
            const hit = event.data as HitPreview;
            setHits(prev => {
              if (prev.some(h => h.index === hit.index)) return prev;
              return [...prev, hit];
            });
            break;
          }
          case 'done': {
            const data = event.data as SemanticSearchResponse;
            setResponse(data);
            setStage(null);
            setView(data.abstained ? 'abstained' : 'results');
            break;
          }
          case 'error': {
            const d = event.data as { message: string };
            setError(d.message);
            setView('idle');
            setStage(null);
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
          } catch { /* 忽略解析失败的行 */ }
        }
      }
      // 处理 buffer 中可能剩余的最后一行
      if (buffer.trim()) {
        try {
          handleEvent(JSON.parse(buffer));
        } catch { /* 忽略 */ }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError('网络异常，请稍后重试');
      setView('idle');
    }
  }, [query, mode]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setQuery('');
    setStage(null);
    setStageInfo(null);
    setHits([]);
    setResponse(null);
    setError(null);
    setView('idle');
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    query,
    mode,
    view,
    response,
    error,
    /** 检索枢纽是否已退让到顶部（非空闲态） */
    showTop: view !== 'idle',
    /** 详情面板可导航的结果：首屏 + 「加载更多」全部（`more` 已按相关度降序） */
    allItems: (response ? [...response.results, ...response.more] : []) as SearchResultItem[],
    /** 首屏命中的图书 id，供 3D 背景联动高亮 */
    matchedIds: response?.results.map(item => item.book.id),
    abstainCopy: abstainCopyFor(response?.abstainReason),
    setQuery,
    setMode,
    submit,
    reset,
    clearError,
    // 流式进度状态
    stage,
    stageInfo,
    hits
  };
}
