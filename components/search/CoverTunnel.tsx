'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { SearchCoverItem } from '@/lib/content';

/** 基础慢速巡航速度（px/s）：沉稳悠扬的书香漫游感 */
const CRUISE_SPEED = 12;

/** 检索态超光速穿梭速度（px/s）：星际折跃般的极速呼啸飞驰狂飙 */
const WARP_SPEED = 3200;

/** 8 列交错位移序列（px），打破横平竖直的表格感，营造如同杂志展廊般的流动波浪律动 */
const COLUMN_OFFSETS = [0, 68, 20, 84, 32, 76, 12, 52];

interface CoverTunnelProps {
  covers: SearchCoverItem[];
  /** 聚焦检索框或检索中时背景退让（Blur + 压暗） */
  dimmed: boolean;
  /** 可选：当外部有高亮图书时的 ID 列表 */
  highlightIds?: string[];
  /** 是否处于极速检索穿梭态 */
  isSearching?: boolean;
}

/**
 * 3D 沉浸式动态背景书墙：
 * - 基础态：以 12px/s 悠扬漫步巡航，呈现静谧的书香世界；
 * - 检索态：瞬间平滑爆发加速至 3200px/s 极速穿梭（Warp Speed），全屏 8 列书海瀑布纵向飞速疾驰，伴随高频暗金激光扫掠；
 * - 结果态：以物理阻尼（Lerp Brake）平滑降速刹车回常态，为 Top 1 的破壁跃出提供震撼的沉浸舞台！
 */
export default function CoverTunnel({
  covers,
  dimmed,
  highlightIds,
  isSearching = false
}: CoverTunnelProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const firstBlockRef = useRef<HTMLDivElement>(null);
  const periodRef = useRef(0);
  const offsetRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);

  // 速度阻尼状态机引用
  const currentSpeedRef = useRef(CRUISE_SPEED);
  const isSearchingRef = useRef(isSearching);
  isSearchingRef.current = isSearching;

  // 将全量封面平均分流到 8 个纵向流中
  const columns = useMemo(() => {
    if (!covers || covers.length === 0) return [];
    const count = Math.floor(covers.length / 8) * 8;
    const pool = count > 0 ? covers.slice(0, count) : covers;
    const cols: SearchCoverItem[][] = Array.from({ length: 8 }, () => []);
    pool.forEach((item, i) => {
      cols[i % 8].push(item);
    });
    return cols;
  }, [covers]);

  // 动态监听并精确测量第一段 Block 的高度 + gap，构成严丝合缝的单轮周期
  useEffect(() => {
    const el = firstBlockRef.current;
    if (!el) return;

    const measure = () => {
      const spacer = el.nextElementSibling as HTMLElement | null;
      const gap = spacer ? spacer.offsetHeight : 24;
      periodRef.current = el.offsetHeight + gap;
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [columns]);

  // 60fps~120fps 恒速平滑循环与超光速加速/阻尼刹车帧循环
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) return;

    let raf = 0;
    const step = (time: number) => {
      const last = lastTimeRef.current ?? time;
      const dt = Math.min(0.05, (time - last) / 1000);
      lastTimeRef.current = time;

      // 目标速度计算与物理阻尼平滑插值：起步 0.35 闪电爆发加速，刹车 0.04 柔和滑行
      const targetSpeed = isSearchingRef.current ? WARP_SPEED : CRUISE_SPEED;
      const lerpRate = isSearchingRef.current ? 0.35 : 0.04;
      currentSpeedRef.current += (targetSpeed - currentSpeedRef.current) * lerpRate;

      offsetRef.current -= currentSpeedRef.current * dt;

      const period = periodRef.current;
      if (period > 0) {
        // 达到一个周期高度即无缝回绕，Block B 完全覆盖 Block A，视觉跳动为 0
        if (-offsetRef.current >= period) {
          offsetRef.current += period;
        }
        if (offsetRef.current > 0) {
          offsetRef.current -= period;
        }
      }

      if (trackRef.current) {
        trackRef.current.style.transform = `translate3d(0, ${offsetRef.current}px, 0)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const renderBookItem = (item: SearchCoverItem, colIdx: number, itemIdx: number) => {
    const isHighlighted = highlightIds?.includes(item.id);
    const coverSrc = item.coverThumbnailUrl || item.coverImageUrl;

    return (
      <div key={`${item.id}-${itemIdx}`} className="relative">
        <div
          className="relative aspect-[2/3] overflow-hidden bg-[#18181b] transition-[transform,box-shadow,outline-color] duration-300"
          style={
            {
              outline: isHighlighted
                ? '1.5px solid rgba(201, 160, 99, 0.95)'
                : '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: isHighlighted
                ? '0 16px 36px -6px rgba(0,0,0,0.85), 0 0 20px rgba(201,160,99,0.3)'
                : '0 8px 20px -4px rgba(0,0,0,0.55)',
              transform: isHighlighted
                ? 'translateZ(16px) scale(1.03)'
                : 'translateZ(0px) scale(1)'
            } as React.CSSProperties
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverSrc}
            alt={item.title || ''}
            loading={itemIdx < 4 ? 'eager' : 'lazy'}
            decoding="async"
            draggable={false}
            className={`h-full w-full object-cover transition-opacity duration-300 ${
              isHighlighted ? 'opacity-100' : 'opacity-85'
            }`}
          />

          {/* 书脊立体微光微阴影 */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-black/25" />
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-0 overflow-hidden bg-[#0e0d0c] select-none pointer-events-none"
      aria-hidden="true"
    >
      {/* 扫掠激光样式 */}
      <style>{`
        @keyframes laser-warp-sweep {
          0% { top: -10%; opacity: 0.1; }
          50% { opacity: 0.95; }
          100% { top: 110%; opacity: 0.1; }
        }
      `}</style>

      {/* 空间暗角与柔和书香暖金色径向光 */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(201,160,99,0.06),transparent_70%)]" />

      {/* 检索穿梭态激光全屏横扫 */}
      {isSearching && (
        <div
          className="pointer-events-none absolute inset-x-0 h-2.5 bg-gradient-to-r from-transparent via-[#C9A063] to-transparent shadow-[0_0_35px_#C9A063] z-10"
          style={{ animation: 'laser-warp-sweep 0.45s ease-in-out infinite' }}
        />
      )}

      {/* 退让景深层：聚焦检索框或检索中时通过纯 GPU opacity 进行平滑退让 */}
      <div
        className="absolute inset-0 transition-opacity duration-500 ease-out"
        style={{
          opacity: dimmed ? (isSearching ? 0.45 : 0.28) : 0.85
        }}
      >
        {/*
          3D 垂直近景视口：
          - rotateX: 10deg 近乎垂直立墙
          - perspective: 1600px 保持书墙平挺开阔
          - 上部羽化 Mask 让书墙自然贯穿全屏
        */}
        <div
          className="absolute -inset-x-[10vw] -inset-y-[12vh] w-[120vw] h-[124vh]"
          style={{
            perspective: '1600px',
            perspectiveOrigin: '50% 45%',
            WebkitMaskImage:
              'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.5) 4%, #000 10%, #000 92%, transparent 100%)',
            maskImage:
              'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.5) 4%, #000 10%, #000 92%, transparent 100%)'
          }}
        >
          <div
            className="absolute inset-0 flex justify-center"
            style={{
              transform: 'rotateX(10deg)',
              transformOrigin: '50% 45%',
              transformStyle: 'preserve-3d',
              willChange: 'transform'
            }}
          >
            {/* 8 列错位瀑布流阵列 */}
            <div
              ref={trackRef}
              className="grid grid-cols-4 gap-4 sm:gap-5 md:grid-cols-6 lg:gap-6 xl:grid-cols-8 px-6 w-full max-w-[1920px] justify-center"
              style={{ willChange: 'transform' }}
            >
              {columns.map((colItems, colIdx) => (
                <div
                  key={colIdx}
                  className={`flex flex-col ${
                    colIdx >= 6 ? 'hidden xl:flex' : colIdx >= 4 ? 'hidden md:flex' : 'flex'
                  }`}
                  style={{
                    transform: `translate3d(0, ${COLUMN_OFFSETS[colIdx]}px, 0)`
                  }}
                >
                  {/* 第一段 Block A */}
                  <div
                    ref={colIdx === 0 ? firstBlockRef : undefined}
                    className="flex flex-col gap-5 sm:gap-6 lg:gap-7"
                  >
                    {colItems.map((item, index) => renderBookItem(item, colIdx, index))}
                  </div>

                  {/* 中间无缝过渡间距，高度严格对齐 gap */}
                  <div className="h-5 sm:h-6 lg:h-7 shrink-0" />

                  {/* 第二段 Block B（完全相同的内容，确保循环时零跳动无缝衔接） */}
                  <div className="flex flex-col gap-5 sm:gap-6 lg:gap-7">
                    {colItems.map((item, index) =>
                      renderBookItem(item, colIdx, index + colItems.length)
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 聚焦/检索退让暗幕 */}
      <div
        className={`pointer-events-none absolute inset-0 bg-[#0e0d0c]/60 transition-opacity duration-500 ease-out ${
          dimmed ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}
