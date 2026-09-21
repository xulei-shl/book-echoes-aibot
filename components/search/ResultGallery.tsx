'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { SearchResultItem } from '@/lib/search/types';
import ResultCard from './ResultCard';

interface ResultGalleryProps {
  results: SearchResultItem[];
  onOpen: (item: SearchResultItem) => void;
}

const FOLD_THRESHOLD = 30;

export default function ResultGallery({ results, onOpen }: ResultGalleryProps) {
  const [foldOpen, setFoldOpen] = useState(false);

  // 未完成语义排序的结果不折叠（relevancePct 为 0 但不代表「不相关」）
  const main = results.filter(item => !item.ranked || item.relevancePct >= FOLD_THRESHOLD);
  const folded = results.filter(item => item.ranked && item.relevancePct < FOLD_THRESHOLD);

  return (
    <div className="w-full">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.035 } } }}
        className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
      >
        {main.map(item => (
          <motion.div
            key={item.book.id}
            variants={{
              hidden: { opacity: 0, y: 16, scale: 0.96 },
              visible: { opacity: 1, y: 0, scale: 1 }
            }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <ResultCard item={item} onOpen={onOpen} />
          </motion.div>
        ))}
      </motion.div>

      {folded.length > 0 && (
        <div className="mt-10">
          <button
            type="button"
            onClick={() => setFoldOpen(open => !open)}
            className="font-mono text-xs tracking-wider text-[#6F6D68] transition-colors hover:text-[#C9A063]"
          >
            相关度 &lt; {FOLD_THRESHOLD}% 的 {folded.length} 条 {foldOpen ? '收起' : '展开'}
          </button>
          <AnimatePresence initial={false}>
            {foldOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {folded.map(item => (
                    <ResultCard key={item.book.id} item={item} onOpen={onOpen} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
