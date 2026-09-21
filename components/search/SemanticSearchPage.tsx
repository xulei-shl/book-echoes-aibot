'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import type { RandomIndexItem } from '@/lib/content';
import type { SearchMode, SearchResultItem, SemanticSearchResponse } from '@/lib/search/types';
import CoverTunnel from './CoverTunnel';
import ResultChips from './ResultChips';
import ResultGallery from './ResultGallery';
import SearchBox from './SearchBox';

/** idle → searching → results / abstained → idle（图 5 状态机） */
type View = 'idle' | 'searching' | 'results' | 'abstained';

interface SemanticSearchPageProps {
  covers: RandomIndexItem[];
}

export default function SemanticSearchPage({ covers }: SemanticSearchPageProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('fast');
  const [view, setView] = useState<View>('idle');
  const [isFocused, setIsFocused] = useState(false);
  const [response, setResponse] = useState<SemanticSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showTop = view !== 'idle';

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
        body: JSON.stringify({ query: trimmed, mode, limit: 12 })
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

  const reset = () => {
    setQuery('');
    setResponse(null);
    setError(null);
    setView('idle');
  };

  const open = (item: SearchResultItem) => router.push(item.deepLink);

  return (
    <>
      <CoverTunnel covers={covers} dimmed={isFocused || view === 'searching'} />

      <main
        className={`relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 transition-[padding] duration-500 md:px-8 ${
          showTop ? 'justify-start pb-24 pt-[5vh]' : 'justify-center pb-[14vh]'
        }`}
      >
        <motion.div
          layout
          transition={{ layout: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } }}
          className="mx-auto w-full max-w-2xl"
        >
          <AnimatePresence>
            {!showTop && (
              <motion.h1
                initial={{ opacity: 0, scale: 0.92, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                className="mb-8 text-center font-hero-title text-3xl tracking-wide text-[#E8E6DC] drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] md:text-4xl"
              >
                在馆藏里找一本书
              </motion.h1>
            )}
          </AnimatePresence>

          <SearchBox
            value={query}
            onChange={setQuery}
            onSubmit={submit}
            onClear={reset}
            onFocusChange={setIsFocused}
            isSearching={view === 'searching'}
            isFocused={isFocused}
            mode={mode}
            onModeChange={setMode}
          />
        </motion.div>

        {error && (
          <p className="mx-auto mt-8 max-w-2xl text-center font-body text-sm text-[#D4A574]">
            {error}
          </p>
        )}

        <AnimatePresence mode="wait">
          {view === 'abstained' && (
            <motion.section
              key="abstained"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto mt-16 max-w-xl rounded-2xl border border-[#C9A063]/25 bg-[#1a1a1a]/50 p-8 text-center backdrop-blur-xl"
            >
              <p className="font-display text-lg text-[#E8E6DC]">馆藏里没有合适的</p>
              <p className="mt-3 font-body text-sm leading-relaxed text-[#A2A09A]">
                这次没有找到真正相关的书，所以没有硬塞结果。可以换一个说法，或补充主题、人物、年代等线索再试。
              </p>
              {response && response.degraded.length > 0 && (
                <p className="mt-4 font-mono text-[11px] text-[#6F6D68]">
                  部分能力已降级：{response.degraded.join('、')}
                </p>
              )}
            </motion.section>
          )}

          {view === 'results' && response && response.results.length > 0 && (
            <motion.section
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-10"
            >
              <ResultChips intent={response.intent} mode={response.mode} degraded={response.degraded} />
              <div className="mt-8">
                <ResultGallery results={response.results} onOpen={open} />
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <div className="noise-overlay" style={{ zIndex: 20 }} />
    </>
  );
}
