'use client';

import { useCallback, useState } from 'react';
import type { SearchMode, SearchResultItem, SemanticSearchResponse } from '@/lib/search/types';
import { abstainCopyFor } from './abstainCopy';

/**
 * 检索状态机与请求：`idle → searching → results / abstained → idle`。
 *
 * 与页面组件分开的理由：这里是**唯一**与后端契约打交道的地方（请求形状、错误文案、
 * 首屏条数），而页面只剩布局与动效。改契约或改文案时不必在 JSX 里翻找。
 */

export type SearchView = 'idle' | 'searching' | 'results' | 'abstained';

/** 首屏条数：搜索页不提供分页控件，更多结果走响应的 `more` 分区揭示（不触发新请求）。 */
const LIMIT = 12;

export function useSemanticSearch() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('fast');
  const [view, setView] = useState<SearchView>('idle');
  const [response, setResponse] = useState<SemanticSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setView('searching');
    setError(null);
    setResponse(null);
    try {
      const res = await fetch('/api/semantic-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed, mode, limit: LIMIT })
      });
      const body = (await res.json().catch(() => null)) as
        | SemanticSearchResponse
        | { error?: string }
        | null;
      if (!res.ok) {
        setError((body as { error?: string } | null)?.error ?? '检索失败，请稍后重试');
        setView('idle');
        return;
      }
      const data = body as SemanticSearchResponse;
      setResponse(data);
      setView(data.abstained ? 'abstained' : 'results');
    } catch {
      setError('网络异常，请稍后重试');
      setView('idle');
    }
  }, [query, mode]);

  const reset = useCallback(() => {
    setQuery('');
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
    clearError
  };
}
