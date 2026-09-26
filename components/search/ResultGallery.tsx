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
 * Top 1 电影级连续镜头破壁卡片：
 * 1. 破壁爆发（Phase: breaking，0~320ms）：
 *    - 初始深渊光子态（scale: 0.15, blur(14px), 过曝高亮）；
 *    - 同步引爆金色 Shockwave 冲击波光环撕裂背景；
 *    - 以爆炸式动量曲线 [0.16, 1, 0.3, 1] 破壁击穿屏幕，暴冲至视口绝对中心（scale: 1.42）！
 * 2. 居中定格特写（Phase: focused，320ms~1120ms，从容停顿整整 800ms）：
 *    - 留出充足呼吸时间，金色脉冲呼吸光晕与流光徽标让用户看清第一名封面与书名；
 * 3. 弹簧滑翔入位（Phase: gliding，1120ms~1540ms，420ms）：
 *    - 沿物理弹簧曲线（stiffness: 320, damping: 26）从中央平滑收缩回 1.0 并飞入自身卡槽 (0, 0)；
 *    - 100% 严丝合缝落入 Slot 0！
 * 4. 恢复交互（Phase: settled）：
 *    - 恢复常规层级与点击打开详情等操作。
 */
function TopResultHeroCard({
  item,
  onOpen
}: {
  item: SearchResultItem;
  onOpen: (item: SearchResultItem) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'breaking' | 'focused' | 'gliding' | 'settled'>('breaking');
  const [delta, setDelta] = useState<{ x: number; y: number } | null>(null);

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

    // 拍 1：0~320ms 破壁暴冲冲至正中央，随后进入定格特写
    const focusTimer = setTimeout(() => {
      setPhase('focused');
    }, 320);

    // 拍 2：在正中央从容停顿 800ms（至 1120ms），随后启动弹簧滑翔
    const glideTimer = setTimeout(() => {
      setPhase('gliding');
    }, 1120);

    // 拍 3：滑翔归位耗时 420ms 后（至 1540ms）settle 恢复常规状态
    const settleTimer = setTimeout(() => {
      setPhase('settled');
    }, 1540);

    return () => {
      clearTimeout(focusTimer);
      clearTimeout(glideTimer);
      clearTimeout(settleTimer);
    };
  }, []);

  if (!delta) {
    return <div ref={containerRef} className="relative aspect-[2/3] w-full invisible" />;
  }

  return (
    <div ref={containerRef} className="relative aspect-[2/3] w-full">
      {/* 破壁爆发冲击波光环（Shockwave Pulse） */}
      {phase === 'breaking' && (
        <motion.div
          initial={{ x: delta.x, y: delta.y, scale: 0.2, opacity: 0.95 }}
          animate={{ x: delta.x, y: delta.y, scale: 2.8, opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none absolute -inset-6 z-50 rounded-full border-2 border-[#C9A063] shadow-[0_0_60px_#C9A063]"
        />
      )}

      {/* Top 1 破壁卡片本体 */}
      <motion.div
        initial={{
          x: delta.x,
          y: delta.y,
          scale: 0.15,
          opacity: 0,
          filter: 'blur(14px) brightness(2.2)',
          zIndex: 70
        }}
        animate={
          phase === 'breaking'
            ? {
                x: delta.x,
                y: delta.y,
                scale: 1.42,
                opacity: 1,
                filter: 'blur(0px) brightness(1)',
                zIndex: 70,
                transition: {
                  duration: 0.32,
                  ease: [0.16, 1, 0.3, 1]
                }
              }
            : phase === 'focused'
            ? {
                x: delta.x,
                y: delta.y,
                scale: 1.35,
                opacity: 1,
                filter: 'blur(0px) brightness(1)',
                zIndex: 70,
                transition: {
                  duration: 0.3,
                  ease: 'easeOut'
                }
              }
            : phase === 'gliding'
            ? {
                x: 0,
                y: 0,
                scale: 1.0,
                opacity: 1,
                filter: 'blur(0px) brightness(1)',
                zIndex: 70,
                transition: {
                  type: 'spring',
                  stiffness: 320,
                  damping: 26,
                  mass: 0.85
                }
              }
            : {
                x: 0,
                y: 0,
                scale: 1.0,
                opacity: 1,
                filter: 'blur(0px) brightness(1)',
                zIndex: 1
              }
        }
        className={`absolute inset-0 transition-shadow duration-300 ${
          phase === 'breaking' || phase === 'focused'
            ? 'shadow-[0_0_65px_rgba(201,160,99,0.85)] ring-2 ring-[#C9A063]'
            : ''
        }`}
      >
        <ResultCard
          item={item}
          onOpen={onOpen}
          badge={phase !== 'settled' ? 'TOP 1 破壁命中' : undefined}
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
          // 第 1 张卡片：作为主角执行破壁爆发、居中停顿与弹簧落座动画
          if (index === 0) {
            return (
              <TopResultHeroCard
                key={item.book.id}
                item={item}
                onOpen={onOpen}
              />
            );
          }

          // 其余卡片：在 Top 1 居中特写从容停顿完毕启动滑翔入座时（1.12s 后）向四周如水波涟漪般错峰浮现
          return (
            <motion.div
              key={item.book.id}
              initial={{ opacity: 0, y: 18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                delay: 1.12 + (index - 1) * 0.04,
                duration: 0.3,
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
