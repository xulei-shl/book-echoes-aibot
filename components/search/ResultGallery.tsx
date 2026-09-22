'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { SearchResultItem } from '@/lib/search/types';
import ResultCard from './ResultCard';

interface ResultGalleryProps {
  /** 首屏主列表：通过门控的候选 */
  results: SearchResultItem[];
  /** 「加载更多」来源：本次已判分但首屏没展示的候选（含未列入推荐项） */
  more?: SearchResultItem[];
  /** 初始已揭示的 more 条数（弃权态下显式展开时可直接显示一批） */
  initialVisible?: number;
  onOpen: (item: SearchResultItem) => void;
}

/** 每次点击揭示的条数 */
const MORE_PAGE_SIZE = 12;

const gridClass = 'grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6';

const itemVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.24,
      ease: [0.23, 1, 0.32, 1] as const
    }
  }
};

export default function ResultGallery({
  results,
  more = [],
  initialVisible = 0,
  onOpen
}: ResultGalleryProps) {
  const [visibleMore, setVisibleMore] = useState(initialVisible);
  const revealed = more.slice(0, visibleMore);
  const remaining = more.length - revealed.length;

  const renderCard = (item: SearchResultItem) => (
    <motion.div key={item.book.id} variants={itemVariants}>
      <ResultCard
        item={item}
        onOpen={onOpen}
        {...(item.passedGate ? {} : { badge: '未列入推荐' })}
      />
    </motion.div>
  );

  return (
    <div className="w-full">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.035 } } }}
        className={gridClass}
      >
        {results.map(renderCard)}
      </motion.div>

      {more.length > 0 && (
        <div className="mt-10">
          {revealed.length === 0 ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleMore(MORE_PAGE_SIZE)}
                className="border border-[#C9A063]/40 bg-[#141312]/60 px-5 py-2 font-body text-sm text-[#E5BE82] shadow-sm backdrop-blur-md transition-[border-color,background-color,color] duration-200 hover:border-[#C9A063]/80 hover:bg-[#161514]/80 hover:text-[#F2F0E9] active:scale-[0.97]"
              >
                加载更多（还有 {more.length} 条）
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6 flex items-center gap-4">
                <span className="h-px flex-1 bg-[#C9A063]/20" />
                <span className="font-mono text-[11px] tracking-wider text-[#6F6D68]">
                  更多结果 · 按相关度排序
                </span>
                <span className="h-px flex-1 bg-[#C9A063]/20" />
              </div>

              <motion.div
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.03 } } }}
                className={gridClass}
              >
                {revealed.map(renderCard)}
              </motion.div>

              {remaining > 0 && (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setVisibleMore(count => count + MORE_PAGE_SIZE)}
                    className="border border-[#C9A063]/40 bg-[#141312]/60 px-5 py-2 font-body text-sm text-[#E5BE82] shadow-sm backdrop-blur-md transition-[border-color,background-color,color] duration-200 hover:border-[#C9A063]/80 hover:bg-[#161514]/80 hover:text-[#F2F0E9] active:scale-[0.97]"
                  >
                    加载更多（还有 {remaining} 条）
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
