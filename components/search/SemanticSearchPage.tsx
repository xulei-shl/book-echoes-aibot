'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import type { SearchCoverItem } from '@/lib/content';
import type { SearchMode, SearchResultItem, SemanticSearchResponse } from '@/lib/search/types';
import SearchBookDetail from './SearchBookDetail';
import CoverTunnel from './CoverTunnel';
import ResultChips from './ResultChips';
import ResultGallery from './ResultGallery';
import SearchBox from './SearchBox';

/** idle → searching → results / abstained → idle */
type View = 'idle' | 'searching' | 'results' | 'abstained';

interface SemanticSearchPageProps {
  covers: SearchCoverItem[];
}

export default function SemanticSearchPage({ covers }: SemanticSearchPageProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('fast');
  const [view, setView] = useState<View>('idle');
  const [isFocused, setIsFocused] = useState(false);
  const [response, setResponse] = useState<SemanticSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const showTop = view !== 'idle';

  const submit = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setView('searching');
    setError(null);
    setResponse(null);
    setActiveIndex(null);
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
    setActiveIndex(null);
  };

  const handleOpenDetail = (item: SearchResultItem) => {
    const index = response?.results.findIndex(r => r.book.id === item.book.id) ?? -1;
    setActiveIndex(index >= 0 ? index : null);
  };

  const handleNavigate = (deepLink: string) => {
    router.push(deepLink);
  };

  // 获取结果命中的图书ID列表，联动 3D 背景进行光影高亮呼应
  const matchedIds = response?.results.map(r => r.book.id);

  return (
    <>
      <CoverTunnel
        covers={covers}
        dimmed={isFocused || view !== 'idle'}
        highlightIds={matchedIds}
      />

      {/*
        容器采用固定稳健内边距 pt-24 md:pt-28，
        留出顶部 Header 导航栏的绝对安全高度（64px~80px），杜绝重叠！
      */}
      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center px-5 pt-24 pb-24 md:px-8 md:pt-28">
        {/*
          检索枢纽区：通过纯 GPU 合成层 translateY 驱动初始居中 (20vh) 与 常驻顶部 (0)，
          彻底消除父级 Flex 切换引发的重排与卡顿，实现 120fps 极度丝滑物理过渡！
        */}
        <motion.div
          animate={{ y: showTop ? 0 : '18vh' }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-2xl"
        >
          <AnimatePresence>
            {!showTop && (
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -14, height: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <h1 className="mb-6 text-center font-hero-title text-3xl tracking-wider text-[#F2F0E9] drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)] md:text-4xl">
                  在馆藏里找一本书
                </h1>
              </motion.div>
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
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 border border-[#D4A574]/40 bg-[#161514]/90 px-4 py-2 text-center font-body text-sm text-[#E5BE82] shadow-lg backdrop-blur-md"
          >
            {error}
          </motion.p>
        )}

        <AnimatePresence mode="wait">
          {view === 'abstained' && (
            <motion.section
              key="abstained"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="relative mt-12 w-full max-w-xl border border-[#C9A063]/40 bg-[#161514]/95 p-8 text-center shadow-2xl backdrop-blur-xl"
            >
              <p className="font-display text-lg text-[#F2F0E9]">馆藏里没有高度契合的书籍</p>
              <p className="mt-3 font-body text-sm leading-relaxed text-[#DCD9D0]">
                这次没有检索到真正相关的藏书，因此没有勉强提供不精准的结果。建议补充作者、主题背景或时代线索再试。
              </p>
              {response && response.degraded.length > 0 && (
                <p className="mt-4 font-mono text-[11px] text-[#A8A59E]">
                  部分辅助通道已降级：{response.degraded.join('、')}
                </p>
              )}
            </motion.section>
          )}

          {view === 'results' && response && response.results.length > 0 && (
            <motion.section
              key="results"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="mt-8 w-full"
            >
              <div className="mb-6 flex justify-center">
                <ResultChips intent={response.intent} mode={response.mode} degraded={response.degraded} />
              </div>
              <ResultGallery results={response.results} onOpen={handleOpenDetail} />
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* 单本详读：复用画板同款右侧详情面板，上一条/下一条切换检索结果 */}
      <SearchBookDetail
        results={response?.results ?? []}
        activeIndex={activeIndex}
        onClose={() => setActiveIndex(null)}
        onSelectIndex={setActiveIndex}
        onOpenArchive={handleNavigate}
      />

      <div className="noise-overlay" style={{ zIndex: 20 }} />
    </>
  );
}

