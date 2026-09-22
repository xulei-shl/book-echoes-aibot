'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import type { SearchCoverItem } from '@/lib/content';
import type { SearchResultItem } from '@/lib/search/types';
import SearchBookDetail from './SearchBookDetail';
import CoverTunnel from './CoverTunnel';
import ResultChips from './ResultChips';
import ResultGallery from './ResultGallery';
import SearchBox from './SearchBox';
import { useSemanticSearch } from './useSemanticSearch';

interface SemanticSearchPageProps {
  covers: SearchCoverItem[];
}

/**
 * `/search` 页面：只负责布局与动效。
 * 检索状态机与请求在 `useSemanticSearch`，弃权文案在 `abstainCopy`。
 */
export default function SemanticSearchPage({ covers }: SemanticSearchPageProps) {
  const router = useRouter();
  const {
    query,
    mode,
    view,
    response,
    error,
    showTop,
    allItems,
    matchedIds,
    abstainCopy,
    setQuery,
    setMode,
    submit,
    reset,
    clearError
  } = useSemanticSearch();

  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [showAbstainedMore, setShowAbstainedMore] = useState(false);

  const hubRef = useRef<HTMLDivElement>(null);
  const [idleOffset, setIdleOffset] = useState(0);

  // 空闲态检索枢纽精确垂直居中：实测枢纽自身高度与视口中心，得出纯 GPU 位移值，
  // 并随窗口尺寸自适应，避免 magic number 也避免过渡链路引入重排。
  useEffect(() => {
    const measure = () => {
      const el = hubRef.current;
      if (!el) return;
      const naturalTop = el.offsetTop;
      // 极端矮视口下不抬升越过自然顶部，避免与固定 Header 重叠
      const offset = window.innerHeight / 2 - el.offsetHeight / 2 - naturalTop;
      setIdleOffset(Math.max(0, offset));
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = new ResizeObserver(measure);
    if (hubRef.current) ro.observe(hubRef.current);
    return () => {
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, []);

  // 详情面板与「展开低相关度结果」都是页面级 UI 状态：每次新检索都要归零
  const handleSubmit = () => {
    setActiveIndex(null);
    setShowAbstainedMore(false);
    void submit();
  };

  const handleReset = () => {
    setActiveIndex(null);
    setShowAbstainedMore(false);
    reset();
  };

  const handleOpenDetail = (item: SearchResultItem) => {
    const index = allItems.findIndex(r => r.book.id === item.book.id);
    setActiveIndex(index >= 0 ? index : null);
  };

  const handleNavigate = (deepLink: string) => {
    router.push(deepLink);
  };

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
          检索枢纽区：纯 GPU 合成层驱动垂直位移，
          标题退场采用绝对定位 + 纯合成层淡出，彻底消除 height: 0 引发的全局重排与卡顿！
        */}
        <motion.div
          ref={hubRef}
          animate={{ y: showTop ? 0 : idleOffset }}
          transition={
            showTop
              ? { duration: 0.28, ease: [0.23, 1, 0.32, 1] }
              : { duration: 0.42, ease: [0.23, 1, 0.32, 1] }
          }
          className="relative w-full max-w-2xl"
        >
          <AnimatePresence>
            {!showTop && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="pointer-events-none absolute -top-16 left-0 right-0 text-center md:-top-20"
              >
                <h1 className="font-hero-title text-3xl tracking-wider text-[#F2F0E9] drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)] md:text-4xl text-balance">
                  在馆藏里找一本书
                </h1>
              </motion.div>
            )}
          </AnimatePresence>

          <SearchBox
            value={query}
            onChange={val => {
              setQuery(val);
              if (error) clearError();
            }}
            onSubmit={handleSubmit}
            onClear={handleReset}
            onFocusChange={setIsFocused}
            isSearching={view === 'searching'}
            isFocused={isFocused}
            mode={mode}
            onModeChange={setMode}
            hasActiveSearch={showTop}
          />

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="mx-auto mt-4 flex w-fit items-center gap-3 border border-[#D4A574]/40 bg-[#141312]/85 px-4 py-2 font-body text-sm text-[#E5BE82] shadow-xl backdrop-blur-md"
              >
                <span>{error}</span>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="border-b border-[#E5BE82]/60 pb-0.5 font-mono text-xs text-[#E5BE82] transition-colors hover:border-[#F2F0E9] hover:text-[#F2F0E9]"
                >
                  重试
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <AnimatePresence mode="wait">
          {view === 'abstained' && (
            <motion.section
              key="abstained"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}
              className="relative mt-12 w-full max-w-xl border border-[#C9A063]/40 bg-[#141312]/80 p-8 text-center shadow-2xl backdrop-blur-2xl"
            >
              <p className="font-display text-lg text-[#F2F0E9] text-balance">{abstainCopy.title}</p>
              <p className="mt-3 font-body text-sm leading-relaxed text-[#DCD9D0]">
                {abstainCopy.body}
              </p>
              {response && response.degraded.length > 0 && (
                <p className="mt-4 font-mono text-[11px] text-[#A8A59E]">
                  部分辅助通道已降级：{response.degraded.join('、')}
                </p>
              )}
              {response && response.more.length > 0 && !showAbstainedMore && (
                <button
                  type="button"
                  onClick={() => setShowAbstainedMore(true)}
                  className="mt-6 border border-[#C9A063]/40 bg-[#141312]/60 px-4 py-2 font-body text-sm text-[#E5BE82] shadow-sm backdrop-blur-md transition-[border-color,background-color,color] duration-200 hover:border-[#C9A063]/80 hover:bg-[#161514]/80 hover:text-[#F2F0E9]"
                >
                  查看低相关度结果（{response.more.length} 条）
                </button>
              )}
            </motion.section>
          )}

          {view === 'abstained' && response && showAbstainedMore && (
            <motion.section
              key="abstained-more"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}
              className="mt-8 w-full"
            >
              <ResultGallery
                results={[]}
                more={response.more}
                initialVisible={12}
                onOpen={handleOpenDetail}
              />
            </motion.section>
          )}

          {view === 'results' && response && response.results.length > 0 && (
            <motion.section
              key="results"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}
              className="mt-8 w-full"
            >
              <div className="mb-6 flex justify-center">
                <ResultChips intent={response.intent} mode={response.mode} degraded={response.degraded} />
              </div>
              <ResultGallery
                results={response.results}
                more={response.more}
                onOpen={handleOpenDetail}
              />
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* 单本详读：复用画板同款右侧详情面板，上一条/下一条切换检索结果 */}
      <SearchBookDetail
        results={allItems}
        activeIndex={activeIndex}
        onClose={() => setActiveIndex(null)}
        onSelectIndex={setActiveIndex}
        onOpenArchive={handleNavigate}
      />

      <div className="noise-overlay" style={{ zIndex: 20 }} />
    </>
  );
}
