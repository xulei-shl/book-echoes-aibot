'use client';

import { useState, useRef, useLayoutEffect } from 'react';
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

/**
 * Top 1 电影级连续镜头卡片：
 * 1. 挂载时通过物理几何计算（getBoundingClientRect）求出从本卡槽到屏幕正中心的真实位移向量；
 * 2. 先在【屏幕正中央】优雅升起特写放大（scale: 1.35），金色瞄准光晕脉冲定格；
 * 3. 随后沿弹簧物理轨迹平滑缩放回 1.0 并飞回真实网格的第一格（Slot 0），绝无跳脱偏差！
 */
function TopResultHeroCard({
  item,
  onOpen
}: {
  item: SearchResultItem;
  onOpen: (item: SearchResultItem) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'rising' | 'flying' | 'settled'>('rising');
  const [delta, setDelta] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const cardCenterX = rect.left + rect.width / 2;
    const cardCenterY = rect.top + rect.height / 2;

    // 绝对精确计算出：从本卡槽自身位置到屏幕正中心的物理位移向量
    setDelta({
      x: centerX - cardCenterX,
      y: centerY - cardCenterY
    });

    // 正中央特写定格 260ms，随后启动缩放滑翔
    const flyTimer = setTimeout(() => {
      setPhase('flying');
    }, 260);

    // 飞回原位耗时 340ms 后 settle 恢复常规交互
    const settleTimer = setTimeout(() => {
      setPhase('settled');
    }, 600);

    return () => {
      clearTimeout(flyTimer);
      clearTimeout(settleTimer);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative aspect-[2/3] w-full">
      <motion.div
        animate={
          phase === 'rising'
            ? {
                x: delta.x,
                y: delta.y,
                scale: 1.35,
                opacity: 1,
                zIndex: 60
              }
            : phase === 'flying'
            ? {
                x: 0,
                y: 0,
                scale: 1.0,
                opacity: 1,
                zIndex: 60,
                transition: {
                  type: 'spring',
                  stiffness: 340,
                  damping: 26,
                  mass: 0.85
                }
              }
            : {
                x: 0,
                y: 0,
                scale: 1.0,
                opacity: 1,
                zIndex: 1
              }
        }
        className={`absolute inset-0 transition-shadow duration-300 ${
          phase === 'rising'
            ? 'shadow-[0_0_55px_rgba(201,160,99,0.75)] ring-2 ring-[#C9A063]'
            : ''
        }`}
      >
        <ResultCard
          item={item}
          onOpen={onOpen}
          badge={phase !== 'settled' ? 'TOP 1 命中' : undefined}
          {...(item.passedGate ? {} : { badge: '未列入推荐' })}
        />
      </motion.div>
    </div>
  );
}

export default function ResultGallery({
  results,
  more = [],
  initialVisible = 0,
  onOpen
}: ResultGalleryProps) {
  const [visibleMore, setVisibleMore] = useState(initialVisible);
  const revealed = more.slice(0, visibleMore);
  const remaining = more.length - revealed.length;

  return (
    <div className="w-full">
      <div className={gridClass}>
        {results.map((item, index) => {
          // 第 1 张卡片：作为主角执行物理居中升起与落座动画
          if (index === 0) {
            return (
              <TopResultHeroCard
                key={item.book.id}
                item={item}
                onOpen={onOpen}
              />
            );
          }

          // 其余卡片：在第 1 张卡片飞回时如涟漪般向四周优雅浮现
          return (
            <motion.div
              key={item.book.id}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                delay: 0.28 + (index - 1) * 0.035,
                duration: 0.28,
                ease: [0.23, 1, 0.32, 1]
              }}
            >
              <ResultCard
                item={item}
                onOpen={onOpen}
                {...(item.passedGate ? {} : { badge: '未列入推荐' })}
              />
            </motion.div>
          );
        })}
      </div>

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

              <div className={gridClass}>
                {revealed.map(item => (
                  <motion.div
                    key={item.book.id}
                    initial={{ opacity: 0, y: 12, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
                  >
                    <ResultCard
                      item={item}
                      onOpen={onOpen}
                      {...(item.passedGate ? {} : { badge: '未列入推荐' })}
                    />
                  </motion.div>
                ))}
              </div>

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
