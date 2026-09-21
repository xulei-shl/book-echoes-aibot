'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { SearchResultItem } from '@/lib/search/types';
import WhyPopover from './WhyPopover';

/** ≥70 金 / ≥40 灰金 / 其余灰 */
function dotColor(relevancePct: number): string {
  if (relevancePct >= 70) return '#C9A063';
  if (relevancePct >= 40) return '#D4A574';
  return '#6F6D68';
}

interface ResultCardProps {
  item: SearchResultItem;
  onOpen: (item: SearchResultItem) => void;
}

export default function ResultCard({ item, onOpen }: ResultCardProps) {
  const [whyOpen, setWhyOpen] = useState(false);
  const cover =
    item.book.cardThumbnailUrl ||
    item.book.coverThumbnailUrl ||
    item.book.cardImageUrl ||
    item.book.coverUrl;
  const color = dotColor(item.relevancePct);

  return (
    <div className="group relative">
      <motion.button
        type="button"
        onClick={() => onOpen(item)}
        whileTap={{ scale: 0.96 }}
        whileHover={{ y: -4 }}
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        className="w-full text-left"
      >
        <div className="aspect-[2/3] overflow-hidden rounded-sm bg-[#1a1a1a] shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover}
            alt={item.book.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>

        <div className="mt-3 flex items-start gap-2">
          <span
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="truncate font-display text-sm text-[#E8E6DC]">{item.book.title}</p>
            <p className="truncate font-body text-xs text-[#A2A09A]">
              {item.book.author}
              {item.book.pubYear ? ` · ${item.book.pubYear}` : ''}
            </p>
            <p className="mt-1 font-mono text-[11px] text-[#A2A09A]">
              {item.ranked ? `${item.relevancePct}% 相关` : '待语义排序'}
              {item.lanes.length > 0 ? ` · ${item.lanes.join('/')}` : ''}
            </p>
          </div>
        </div>
      </motion.button>

      <button
        type="button"
        onClick={() => setWhyOpen(open => !open)}
        aria-label="查看判定依据"
        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-[#C9A063]/40 bg-[#0b0b0b]/70 font-mono text-[11px] text-[#C9A063] opacity-0 transition-opacity duration-300 group-hover:opacity-100 focus:opacity-100"
      >
        i
      </button>

      {whyOpen && (
        <div className="absolute right-0 top-8 z-30">
          <WhyPopover item={item} />
        </div>
      )}
    </div>
  );
}
