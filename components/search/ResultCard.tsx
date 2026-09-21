'use client';

import { motion } from 'framer-motion';
import type { SearchResultItem } from '@/lib/search/types';
import WhyPopover from './WhyPopover';

interface ResultCardProps {
  item: SearchResultItem;
  onOpen: (item: SearchResultItem) => void;
}

export default function ResultCard({ item, onOpen }: ResultCardProps) {
  const cover =
    item.book.coverThumbnailUrl ||
    item.book.coverImageUrl ||
    item.book.coverUrl;

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
        <div className="aspect-[2/3] overflow-hidden bg-[#18181b] shadow-[0_12px_32px_rgba(0,0,0,0.5)] outline outline-1 outline-white/10 transition-all duration-300 group-hover:shadow-[0_18px_40px_rgba(0,0,0,0.7)] group-hover:outline-[#C9A063]/50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover}
            alt={item.book.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>

        {/* 底部信息区：仅保留题名与作者，配黑曜石毛玻璃底板与高对比度文字 */}
        <div className="mt-2.5 border border-white/5 bg-[#141312]/85 px-2.5 py-1.5 backdrop-blur-md transition-colors group-hover:border-[#C9A063]/40">
          <p className="truncate font-display text-sm font-medium text-[#F2F0E9] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {item.book.title}
          </p>
          <p className="mt-0.5 truncate font-body text-xs text-[#DCD9D0] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {item.book.author}
            {item.book.pubYear ? ` · ${item.book.pubYear}` : ''}
          </p>
        </div>
      </motion.button>

      {/* 判定依据入口：悬浮自动展开，移开后自动收起；键盘聚焦时同样展开 */}
      <div className="group/why absolute right-1.5 top-1.5 z-30">
        <button
          type="button"
          aria-label="查看判定依据"
          className="flex h-6 w-6 items-center justify-center border border-[#C9A063]/50 bg-[#121212]/90 font-mono text-[11px] text-[#C9A063] shadow-md backdrop-blur-md opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        >
          i
        </button>

        {/* pt-1 作为光标从图标移入弹层的桥接区，避免中途消失；
            仅动画 opacity/transform（合成器属性），不加 will-change，避免整页卡片常驻合成层 */}
        <div className="pointer-events-none invisible absolute right-0 top-full -mr-1.5 origin-top-right pt-1 opacity-0 scale-95 translate-y-1 transition-[opacity,transform,visibility] duration-150 ease-out group-hover/why:pointer-events-auto group-hover/why:visible group-hover/why:translate-y-0 group-hover/why:scale-100 group-hover/why:opacity-100 group-focus-within/why:pointer-events-auto group-focus-within/why:visible group-focus-within/why:translate-y-0 group-focus-within/why:scale-100 group-focus-within/why:opacity-100">
          <WhyPopover item={item} />
        </div>
      </div>
    </div>
  );
}
