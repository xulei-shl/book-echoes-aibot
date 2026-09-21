'use client';

import { useEffect, useRef, useState } from 'react';
import type { RandomIndexItem } from '@/lib/content';

/** 基础滚动速度（px/s）。悬停时平滑降到 0，移开后缓动恢复。 */
const BASE_VELOCITY = 22;

interface CoverTunnelProps {
  covers: RandomIndexItem[];
  /** 聚焦检索框时背景退让（Blur + 压暗） */
  dimmed: boolean;
}

/**
 * 3D 沉浸式动态背景层：perspective + rotateX 形成星战片头视场，
 * 底→顶无限循环 Marquee，四周羽化 Mask，每张封面叠加微弱 Float。
 *
 * 性能：rAF 里**只写** transform；持续动画元素预置 will-change。
 */
export default function CoverTunnel({ covers, dimmed }: CoverTunnelProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const velocityRef = useRef(BASE_VELOCITY);
  const halfHeightRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);
  const hoveredRef = useRef(false);
  const [hovered, setHovered] = useState(false);

  const loop = covers.length > 0 ? [...covers, ...covers] : [];

  useEffect(() => {
    hoveredRef.current = hovered;
  }, [hovered]);

  // 只在挂载 / 封面变更 / 尺寸变化时测量一次，绝不在 rAF 循环里读 layout
  useEffect(() => {
    const measure = () => {
      if (trackRef.current) halfHeightRef.current = trackRef.current.scrollHeight / 2;
    };
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, [loop.length]);

  useEffect(() => {
    let raf = 0;
    const step = (time: number) => {
      const last = lastTimeRef.current ?? time;
      const dt = Math.min(0.05, (time - last) / 1000);
      lastTimeRef.current = time;

      const target = hoveredRef.current ? 0 : BASE_VELOCITY;
      // 帧率无关的指数缓动，避免急刹车
      velocityRef.current += (target - velocityRef.current) * (1 - Math.exp(-dt * 4));
      offsetRef.current -= velocityRef.current * dt;

      const half = halfHeightRef.current;
      if (half > 0 && -offsetRef.current >= half) offsetRef.current += half;
      if (offsetRef.current > 0) offsetRef.current -= half;

      if (trackRef.current) {
        trackRef.current.style.transform = `translate3d(0, ${offsetRef.current}px, 0)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="fixed inset-0 z-0 overflow-hidden bg-[#0b0b0b]"
      style={{
        perspective: '1200px',
        // 四周羽化 Mask：不占布局、无额外 DOM
        WebkitMaskImage:
          'linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent), linear-gradient(to right, transparent, #000 10%, #000 90%, transparent)',
        WebkitMaskComposite: 'source-in',
        maskImage:
          'linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent), linear-gradient(to right, transparent, #000 10%, #000 90%, transparent)',
        maskComposite: 'intersect'
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 transition-[filter] duration-700 ease-out"
        style={{
          filter: dimmed ? 'blur(7px) brightness(0.6)' : 'blur(0px) brightness(1)',
          willChange: 'filter'
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: 'rotateX(22deg) scale(1.6)',
            transformOrigin: '50% 50%',
            willChange: 'transform'
          }}
        >
          <div
            ref={trackRef}
            className="grid grid-cols-4 gap-[clamp(3rem,6vw,7rem)] px-[8vw] md:grid-cols-6 lg:grid-cols-8"
            style={{ willChange: 'transform' }}
          >
            {loop.map((item, index) => (
              <div
                key={`${item.id}-${index}`}
                className="cover-float aspect-[2/3] overflow-hidden rounded-sm bg-[#1a1a1a]"
                style={
                  {
                    '--float-i': index % 9,
                    animationPlayState: hovered ? 'paused' : 'running'
                  } as React.CSSProperties
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.thumbnailUrl || item.imageUrl}
                  alt=""
                  loading={index < 16 ? 'eager' : 'lazy'}
                  decoding="async"
                  draggable={false}
                  className="h-full w-full object-cover opacity-75"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
