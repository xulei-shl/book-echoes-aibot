'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { SearchCoverItem } from '@/lib/content';

interface CoverMatrixScannerProps {
  /** 全量封面池，用于多行矩阵的高速轮转检索 */
  covers: SearchCoverItem[];
  /** 当前检索阶段 */
  stage?: string | null;
}

/**
 * 广域大尺寸多行书海极速检阅矩阵：
 * 1. 27 幅大尺寸封面铺满 3 排宽幅流动带（高度达 200~250px），横跨 98vw 视口；
 * 2. 60ms 极速洗牌翻转，配合自上而下的暗金激光网格，极具海量书库算力检阅张力；
 * 3. 左右边缘柔和羽化融入暗调背景，兼顾大气质感与书香美学。
 */
export default function CoverMatrixScanner({ covers, stage }: CoverMatrixScannerProps) {
  // 提取可用封面列表
  const pool = useMemo(() => {
    const list = covers.filter(c => Boolean(c.coverThumbnailUrl || c.coverImageUrl));
    return list.length >= 12 ? list : covers;
  }, [covers]);

  const [seed, setSeed] = useState(0);

  // 60ms 极速洗牌翻动矩阵
  useEffect(() => {
    const timer = setInterval(() => {
      setSeed(s => (s + 1) % 1000);
    }, 60);
    return () => clearInterval(timer);
  }, []);

  // 为 3 行矩阵各挑选 9 本大尺寸封面（共 27 本），横跨整块视口
  const row1 = useMemo(() => {
    return Array.from({ length: 9 }, (_, i) => pool[(seed + i * 3) % pool.length]);
  }, [pool, seed]);

  const row2 = useMemo(() => {
    return Array.from({ length: 9 }, (_, i) => pool[(seed + 15 + i * 4) % pool.length]);
  }, [pool, seed]);

  const row3 = useMemo(() => {
    return Array.from({ length: 9 }, (_, i) => pool[(seed + 30 + i * 5) % pool.length]);
  }, [pool, seed]);

  return (
    <div className="relative mx-auto flex w-full max-w-[98vw] flex-col items-center justify-center py-2 select-none overflow-hidden">
      {/* 广域激光扫掠光斑 */}
      <style>{`
        @keyframes laser-sweep-wide {
          0% { top: 0%; opacity: 0.15; }
          50% { opacity: 0.9; }
          100% { top: 100%; opacity: 0.15; }
        }
      `}</style>

      {/* 广域多行大尺寸书海矩阵视口（带左右羽化遮罩，气势开阔宏大） */}
      <div
        className="relative w-full overflow-hidden opacity-85 transition-opacity duration-300"
        style={{
          maskImage:
            'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)'
        }}
      >
        {/* 金色广域激光扫描网格 */}
        <div
          className="pointer-events-none absolute inset-x-0 h-2 bg-gradient-to-r from-transparent via-[#C9A063] to-transparent shadow-[0_0_24px_#C9A063] z-20"
          style={{ animation: 'laser-sweep-wide 1.8s ease-in-out infinite' }}
        />

        {/* 3 行大尺寸交错流动封面带 */}
        <div className="flex flex-col gap-4 py-3">
          {/* 第 1 行：大尺寸微流动（高约 180~220px） */}
          <div className="flex justify-center gap-4.5 -translate-x-12">
            {row1.map((item, idx) => (
              <div
                key={idx}
                className="relative aspect-[2/3] h-38 sm:h-46 md:h-54 shrink-0 overflow-hidden border border-white/10 bg-[#141312] shadow-xl transition-opacity duration-75"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.coverThumbnailUrl || item.coverImageUrl}
                  alt=""
                  className="h-full w-full object-cover opacity-85"
                />
              </div>
            ))}
          </div>

          {/* 第 2 行：居中高亮主行（高约 200~250px） */}
          <div className="flex justify-center gap-4.5 translate-x-8">
            {row2.map((item, idx) => (
              <div
                key={idx}
                className="relative aspect-[2/3] h-44 sm:h-52 md:h-62 shrink-0 overflow-hidden border border-[#C9A063]/30 bg-[#161514] shadow-2xl transition-opacity duration-75"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.coverThumbnailUrl || item.coverImageUrl}
                  alt=""
                  className="h-full w-full object-cover opacity-95"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              </div>
            ))}
          </div>

          {/* 第 3 行：大尺寸微流动（高约 180~220px） */}
          <div className="flex justify-center gap-4.5 -translate-x-8">
            {row3.map((item, idx) => (
              <div
                key={idx}
                className="relative aspect-[2/3] h-38 sm:h-46 md:h-54 shrink-0 overflow-hidden border border-white/10 bg-[#141312] shadow-xl transition-opacity duration-75"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.coverThumbnailUrl || item.coverImageUrl}
                  alt=""
                  className="h-full w-full object-cover opacity-85"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 底部检索状态条 */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-5 flex items-center gap-2 border border-[#C9A063]/30 bg-[#141312]/80 px-4 py-1.5 font-mono text-xs tracking-widest text-[#E5BE82] shadow-2xl backdrop-blur-md"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#C9A063] opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#C9A063]" />
        </span>
        <span>
          {stage === 'reranking'
            ? 'JEV MODEL PARALLEL RERANKING'
            : stage === 'scanning'
            ? 'MULTI-LANE VECTOR SEARCHING'
            : 'SCANNING FULL CATALOGUE'}
        </span>
      </motion.div>
    </div>
  );
}
