'use client';

import type { SearchResultItem } from '@/lib/search/types';

/** 结构化信号呈现（不让 Jev 生成文本，Q2 推荐做法） */
export default function WhyPopover({ item }: { item: SearchResultItem }) {
  return (
    <div className="w-64 border border-[#C9A063]/35 bg-[#121110]/80 p-3 text-left shadow-[0_18px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-[#C9A063]">
        判定依据
      </p>
      <dl className="space-y-1.5 font-mono text-[11px] text-[#C5C2BA] tabular-nums">
        <div className="flex justify-between gap-3">
          <dt>相关度 fit</dt>
          <dd className="text-[#F2F0E9]">{item.fit === null ? '未返回' : item.fit.toFixed(2)}</dd>
        </div>
        {item.why.fitLevelLabel !== null && (
          <div className="flex justify-between gap-3">
            <dt>档位判定</dt>
            <dd className="text-right text-[#F2F0E9]">
              {item.why.fitLevel}（{item.why.fitLevelLabel}）
            </dd>
          </div>
        )}
        {item.why.fitConfidence !== null && (
          <div className="flex justify-between gap-3">
            <dt>档位置信度</dt>
            <dd className="text-[#F2F0E9]">{item.why.fitConfidence.toFixed(2)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt>choice 概率</dt>
          <dd className="text-[#F2F0E9]">{item.matchPct}%</dd>
        </div>
        {item.why.pNone !== null && (
          <div className="flex justify-between gap-3">
            <dt>本批 __none__</dt>
            <dd className="text-[#F2F0E9]">{Math.round(item.why.pNone * 100)}%</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt>本地相对分</dt>
          <dd className="text-[#F2F0E9]">{item.rankScore.toFixed(3)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>召回名次</dt>
          <dd className="text-[#F2F0E9]">#{item.why.recallRank || '—'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>召回通道</dt>
          <dd className="text-[#F2F0E9]">{item.why.lanes.join(' / ') || '—'}</dd>
        </div>
        {Object.entries(item.why.laneScores).map(([lane, score]) => (
          <div key={lane} className="flex justify-between gap-3">
            <dt>{lane} 分</dt>
            <dd className="text-[#F2F0E9]">{score.toFixed(2)}</dd>
          </div>
        ))}
      </dl>
      {item.why.matched.length > 0 && (
        <p className="mt-2 border-t border-[#C9A063]/20 pt-2 font-mono text-[10px] leading-relaxed text-[#A8A59E]">
          命中词：{item.why.matched.slice(0, 8).join('、')}
        </p>
      )}
      {!item.ranked && (
        <p className="mt-2 border-t border-[#C9A063]/20 pt-2 font-mono text-[10px] text-[#E5BE82]">
          语义排序暂不可用，此结果仅来自召回
        </p>
      )}
    </div>
  );
}
