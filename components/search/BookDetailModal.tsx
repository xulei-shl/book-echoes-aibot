'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SearchResultItem } from '@/lib/search/types';

interface BookDetailModalProps {
  item: SearchResultItem | null;
  onClose: () => void;
  onNavigate: (deepLink: string) => void;
}

export default function BookDetailModal({ item, onClose, onNavigate }: BookDetailModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (item) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [item, onClose]);

  if (!item) return null;

  const book = item.book;
  const coverSrc = book.coverThumbnailUrl || book.coverImageUrl || book.coverUrl;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-8">
        {/* 背景遮罩 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/75 backdrop-blur-md"
        />

        {/* 模态卡片主体 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          onClick={e => e.stopPropagation()}
          className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#C9A063]/30 bg-[#161514] p-6 text-[#E8E6DC] shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_35px_rgba(201,160,99,0.15)] md:p-8 about-overlay-scroll"
        >
          {/* 关闭按钮 */}
          <motion.button
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={onClose}
            aria-label="关闭详情"
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[#8C8982] transition-colors hover:bg-white/10 hover:text-[#F2F0E9]"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </motion.button>

          <div className="flex flex-col gap-6 sm:flex-row">
            {/* 真实图书封面大图 */}
            <div className="mx-auto w-44 shrink-0 sm:mx-0 sm:w-52">
              <div className="aspect-[2/3] overflow-hidden rounded-lg bg-[#1a1a1a] shadow-[0_16px_36px_rgba(0,0,0,0.6)] outline outline-1 outline-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverSrc}
                  alt={book.title}
                  className="h-full w-full object-cover"
                />
              </div>

              {/* 语义相关度标签 */}
              <div className="mt-4 rounded-xl border border-[#C9A063]/30 bg-[#C9A063]/10 p-3 text-center">
                <span className="block font-mono text-[11px] text-[#A2A09A]">Jev 语义相关度</span>
                <span className="font-mono text-2xl font-bold tabular-nums text-[#C9A063]">
                  {item.relevancePct}%
                </span>
                {item.lanes.length > 0 && (
                  <span className="mt-1 block font-mono text-[10px] text-[#8C8982]">
                    通道: {item.lanes.join(' + ')}
                  </span>
                )}
              </div>
            </div>

            {/* 图书详细信息 */}
            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <h2 className="font-display text-2xl font-bold text-[#F2F0E9] md:text-3xl text-balance">
                  {book.title}
                </h2>
                {book.subtitle && (
                  <p className="mt-1 font-body text-sm text-[#A2A09A]">{book.subtitle}</p>
                )}
                <p className="mt-2 font-body text-sm text-[#D4A574]">
                  {book.author}
                  {book.publisher ? ` · ${book.publisher}` : ''}
                  {book.pubYear ? ` (${book.pubYear})` : ''}
                </p>
              </div>

              {/* 索书号与评价 */}
              <div className="flex flex-wrap gap-2 text-xs">
                {book.callNumber && (
                  <span className="rounded-md border border-[#C9A063]/40 bg-[#1e1d1b] px-2.5 py-1 font-mono text-[#E8E6DC]">
                    索书号: {book.callNumber}
                  </span>
                )}
                {book.rating && (
                  <span className="rounded-md border border-amber-500/30 bg-[#1e1d1b] px-2.5 py-1 font-mono text-amber-300">
                    豆瓣评分: {book.rating}
                  </span>
                )}
                {book.pages && (
                  <span className="rounded-md border border-[#6F6D68]/40 bg-[#1e1d1b] px-2.5 py-1 font-mono text-[#A2A09A]">
                    {book.pages} 页
                  </span>
                )}
              </div>

              {/* 初评理由 */}
              {book.reason && (
                <div className="rounded-xl border border-[#C9A063]/20 bg-[#181716] p-4">
                  <h4 className="font-display text-xs font-semibold text-[#C9A063]">初评理由</h4>
                  <p className="mt-1.5 font-body text-sm leading-relaxed text-[#E8E6DC] text-pretty">
                    {book.reason}
                  </p>
                </div>
              )}

              {/* 内容简介 */}
              {book.summary && (
                <div>
                  <h4 className="font-display text-xs font-semibold text-[#A2A09A]">内容简介</h4>
                  <p className="mt-1.5 max-h-48 overflow-y-auto font-body text-sm leading-relaxed text-[#C8C5BD] text-pretty about-overlay-scroll pr-1">
                    {book.summary}
                  </p>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="pt-2 flex flex-wrap gap-3">
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  onClick={() => onNavigate(item.deepLink)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#C9A063] px-5 py-2.5 font-display text-sm font-medium text-[#161514] transition-all hover:bg-[#D4A574]"
                >
                  <span>前往期刊档案完整阅览</span>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </motion.button>

                {book.callNumberLink && (
                  <a
                    href={book.callNumberLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#C9A063]/30 px-4 py-2.5 font-mono text-xs text-[#C9A063] transition-colors hover:bg-[#C9A063]/10"
                  >
                    <span>馆藏检索</span>
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
