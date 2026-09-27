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

interface FanConfig {
  xOffset: number;
  yOffset: number;
  rotate: number;
  scale: number;
  zIndex: number;
  badge: string;
  glowClass: string;
  glideDelay: number;
  settleDelay: number;
}

/**
 * 依据位次（rankIndex）与前台 Hero 数量（totalHeroes）
 * 计算扇形几何参数与方案 B（Top 1 ➔ Top 2 ➔ Top 3 依次入座 · 黄金从容档）时间表
 */
function getHeroFanConfig(rankIndex: number, totalHeroes: number, isMobile: boolean): FanConfig {
  // 单本特写（退化兼容）
  if (totalHeroes <= 1) {
    return {
      xOffset: 0,
      yOffset: 0,
      rotate: 0,
      scale: 1.36,
      zIndex: 75,
      badge: 'TOP 1 破壁命中',
      glowClass: 'shadow-[0_0_65px_rgba(201,160,99,0.85)] ring-2 ring-[#C9A063]',
      glideDelay: 1180,
      settleDelay: 1520,
    };
  }

  // 双子星（2 本对开）
  if (totalHeroes === 2) {
    const isLeft = rankIndex === 0;
    const xBase = isMobile ? 48 : 88;
    return {
      xOffset: isLeft ? -xBase : xBase,
      yOffset: 0,
      rotate: isLeft ? -5 : 5,
      scale: 1.22,
      zIndex: isLeft ? 75 : 74,
      badge: isLeft ? 'TOP 1 破壁命中' : 'TOP 2 核心推荐',
      glowClass: isLeft
        ? 'shadow-[0_0_60px_rgba(201,160,99,0.8)] ring-2 ring-[#C9A063]'
        : 'shadow-[0_0_45px_rgba(201,160,99,0.65)] ring-1.5 ring-[#C9A063]/80',
      glideDelay: isLeft ? 1180 : 1300,
      settleDelay: isLeft ? 1520 : 1640,
    };
  }

  // 经典三剑客扇形展开（>= 3 本）
  // 方案 A（黄金从容档）：定格约 860ms 后，Top 1（1180ms）➔ Top 2（1300ms）➔ Top 3（1420ms）依次平滑归位
  const xSpan = isMobile ? 68 : 135;
  if (rankIndex === 0) {
    // 居中核心王者：微悬浮于拱顶中心，定格约 860ms 后最先启动滑翔归位
    return {
      xOffset: 0,
      yOffset: -12,
      rotate: 0,
      scale: 1.26,
      zIndex: 75,
      badge: 'TOP 1 破壁命中',
      glowClass: 'shadow-[0_0_65px_rgba(201,160,99,0.85)] ring-2 ring-[#C9A063]',
      glideDelay: 1180,
      settleDelay: 1520,
    };
  } else if (rankIndex === 1) {
    // 左翼次席：向左偏转 -8°，随后紧跟滑翔归位
    return {
      xOffset: -xSpan,
      yOffset: 8,
      rotate: -8,
      scale: 1.14,
      zIndex: 72,
      badge: 'TOP 2 核心推荐',
      glowClass: 'shadow-[0_0_45px_rgba(201,160,99,0.65)] ring-1.5 ring-[#C9A063]/80',
      glideDelay: 1300,
      settleDelay: 1640,
    };
  } else {
    // 右翼末席：向右偏转 8°，最后平滑归位
    return {
      xOffset: xSpan,
      yOffset: 8,
      rotate: 8,
      scale: 1.14,
      zIndex: 71,
      badge: 'TOP 3 核心推荐',
      glowClass: 'shadow-[0_0_35px_rgba(201,160,99,0.5)] ring-1 ring-[#C9A063]/60',
      glideDelay: 1420,
      settleDelay: 1760,
    };
  }
}

/**
 * 领奖台前三名（Hero Podium）扇形卡片：
 * 1. 破壁展开（Phase: breaking，0~320ms）：
 *    - 从自身卡槽破壁暴冲冲向视口中心，并按扇形微角度（-8°/0°/+8°）平滑展开；
 *    - Top 1 引爆金色 Shockwave 冲击波撕裂背景；
 * 2. 扇形定格特写（Phase: focused，320ms~1180ms，黄金从容定格 860ms）：
 *    - 三本封面呈扇形拱卫，徽章与呼吸光晕高光定格，从容尽览前三佳作；
 * 3. 方案 B 依次滑翔归位（Phase: gliding，1180ms~1760ms）：
 *    - Top 1 率先归位到 Slot 0，Top 2 紧随归位到 Slot 1，Top 3 紧随归位到 Slot 2；
 *    - 沿物理弹簧曲线（stiffness: 340, damping: 28, mass: 0.85）角度回正并严丝合缝落入各自卡槽！
 * 4. 恢复交互（Phase: settled）：
 *    - 恢复常规层级与点击打开详情等操作。
 */
function HeroPodiumCard({
  item,
  rankIndex,
  totalHeroes,
  onOpen
}: {
  item: SearchResultItem;
  rankIndex: number;
  totalHeroes: number;
  onOpen: (item: SearchResultItem) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReducedMotion] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });
  const [phase, setPhase] = useState<'breaking' | 'focused' | 'gliding' | 'settled'>('breaking');
  const [delta, setDelta] = useState<{ x: number; y: number } | null>(null);

  const isMobile = typeof window !== 'undefined' ? window.innerWidth < 640 : false;
  const config = getHeroFanConfig(rankIndex, totalHeroes, isMobile);

  useLayoutEffect(() => {
    if (isReducedMotion || !containerRef.current) return;

    const measure = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const cardCenterX = rect.left + rect.width / 2;
      const cardCenterY = rect.top + rect.height / 2;

      // 计算从本卡槽自身位置到视口绝对中心的物理位移基准向量
      setDelta({
        x: centerX - cardCenterX,
        y: centerY - cardCenterY
      });
    };

    measure();

    // 拍 1：0~320ms 破壁暴冲至扇形位置，随后进入定格特写
    const focusTimer = setTimeout(() => {
      setPhase('focused');
    }, 320);

    // 拍 2：方案 B 依次启动弹簧滑翔归位（Top 1 -> Top 2 -> Top 3）
    const glideTimer = setTimeout(() => {
      setPhase('gliding');
    }, config.glideDelay);

    // 拍 3：滑翔归位完成，settle 恢复常规状态
    const settleTimer = setTimeout(() => {
      setPhase('settled');
    }, config.settleDelay);

    return () => {
      clearTimeout(focusTimer);
      clearTimeout(glideTimer);
      clearTimeout(settleTimer);
    };
  }, [isReducedMotion, config.glideDelay, config.settleDelay]);

  if (isReducedMotion) {
    return (
      <div className="relative aspect-[2/3] w-full">
        <ResultCard
          item={item}
          onOpen={onOpen}
          {...(item.passedGate ? {} : { badge: '未列入推荐' })}
        />
      </div>
    );
  }

  if (!delta || !config) {
    return <div ref={containerRef} className="relative aspect-[2/3] w-full invisible" />;
  }

  const fanX = delta.x + config.xOffset;
  const fanY = delta.y + config.yOffset;

  return (
    <div ref={containerRef} className="relative aspect-[2/3] w-full">
      {/* 仅 Top 1 引爆金色 Shockwave 冲击波光环撕裂背景 */}
      {rankIndex === 0 && phase === 'breaking' && (
        <motion.div
          initial={{ x: delta.x, y: delta.y, scale: 0.2, opacity: 0.95 }}
          animate={{ x: delta.x, y: delta.y, scale: 2.8, opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none absolute -inset-6 z-50 rounded-full border-2 border-[#C9A063] shadow-[0_0_60px_#C9A063]"
        />
      )}

      {/* 破壁扇形卡片本体 */}
      <motion.div
        initial={{
          x: delta.x,
          y: delta.y,
          rotate: 0,
          scale: 0.3,
          opacity: 0,
          zIndex: config.zIndex
        }}
        animate={
          phase === 'breaking'
            ? {
                x: fanX,
                y: fanY,
                rotate: config.rotate,
                scale: config.scale,
                opacity: 1,
                zIndex: config.zIndex,
                transition: {
                  duration: 0.32,
                  ease: [0.16, 1, 0.3, 1]
                }
              }
            : phase === 'focused'
            ? {
                x: fanX,
                y: fanY,
                rotate: config.rotate,
                scale: config.scale,
                opacity: 1,
                zIndex: config.zIndex,
                transition: {
                  duration: 0.24,
                  ease: 'easeOut'
                }
              }
            : phase === 'gliding'
            ? {
                x: 0,
                y: 0,
                rotate: 0,
                scale: 1.0,
                opacity: 1,
                zIndex: config.zIndex,
                transition: {
                  type: 'spring',
                  stiffness: 340,
                  damping: 28,
                  mass: 0.85
                }
              }
            : {
                x: 0,
                y: 0,
                rotate: 0,
                scale: 1.0,
                opacity: 1,
                zIndex: 1
              }
        }
        className={`absolute inset-0 transition-shadow duration-300 will-change-transform ${
          phase === 'breaking' || phase === 'focused'
            ? config.glowClass
            : phase === 'gliding'
            ? 'shadow-[0_0_35px_rgba(201,160,99,0.5)] ring-1 ring-[#C9A063]'
            : ''
        }`}
      >
        <ResultCard
          item={item}
          onOpen={onOpen}
          badge={phase !== 'settled' ? config.badge : undefined}
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

  // 前 1~3 本书作为 Hero 扇形领奖台卡片
  const heroCount = Math.min(3, results.length);
  // 画廊水波涟漪展开的起始延时：随着 Top 1 落座（约 1.52s）启动
  const rippleStartDelay = heroCount === 3 ? 1.52 : heroCount === 2 ? 1.40 : 1.30;

  return (
    <div className="w-full">
      <div className={gridClass}>
        {results.map((item, index) => {
          // 前 heroCount 张卡片：执行破壁爆发、居中扇形定格特写与依次物理弹簧落座动画
          if (index < heroCount) {
            return (
              <HeroPodiumCard
                key={item.book.id}
                item={item}
                rankIndex={index}
                totalHeroes={heroCount}
                onOpen={onOpen}
              />
            );
          }

          // 其余卡片：在 Top 1 撞入 Slot 0 瞬间向四周如水波涟漪般错峰浮现
          return (
            <motion.div
              key={item.book.id}
              initial={{ opacity: 0, y: 18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                delay: rippleStartDelay + (index - heroCount) * 0.04,
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
