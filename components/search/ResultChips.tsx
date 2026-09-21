'use client';

import type { QueryIntent, SearchMode } from '@/lib/search/types';

const INTENT_LABELS: Record<string, string> = {
  concept: '按主题/概念找书',
  work: '找具体作品',
  similar: '找相近风格',
  list: '要一份书单',
  other: '意图未定'
};

const DEGRADED_LABELS: Record<string, string> = {
  understand: '意图理解未完成，已按关键词召回',
  'dense-unavailable': '已在关键词检索模式下运行（语义向量不可用）',
  'dense-timeout': '语义向量超时，已退回关键词检索',
  'dense-mismatch': '向量索引与配置不一致，已退回关键词检索',
  'dense-error': '语义向量服务异常，已退回关键词检索',
  rerank: '语义排序暂不可用，结果仅来自召回',
  'wide-limit': '未执行全库语义宽召回（超出分片上限）',
  'wide-skipped': '未执行全库语义宽召回（语料超出上限）',
  'wide-budget': '未执行全库语义宽召回（已达 Jev 预算）',
  'rerank-budget': '已达 Jev 预算，未执行语义排序'
};

function describeDegraded(code: string): string {
  if (code.startsWith('wide:')) return `部分全库语义分片失败（${code.slice(5)}）`;
  if (code.startsWith('rerank:')) return `部分候选未完成语义排序（${code.slice(7)}）`;
  return DEGRADED_LABELS[code] ?? code;
}

interface ResultChipsProps {
  intent: QueryIntent;
  mode: SearchMode;
  degraded: string[];
}

export default function ResultChips({ intent, mode, degraded }: ResultChipsProps) {
  const facetChips: string[] = [];
  const facets = intent.facets;
  if (facets.wantsFiction > 0.5) facetChips.push('偏虚构');
  if (facets.wantsFiction < 0.5 && facets.wantsFiction !== 0.5) facetChips.push('偏非虚构');
  if (facets.wantsRecent > 0.5) facetChips.push('偏好近年');
  if (facets.avoidTheory > 0.5) facetChips.push('要通俗');
  if (facets.wantsVerified > 0.5) facetChips.push('看重口碑');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="border border-[#C9A063]/50 bg-[#161514]/95 px-3 py-1 font-mono text-[11px] font-medium tracking-wider text-[#C9A063] shadow-md backdrop-blur-md">
        {INTENT_LABELS[intent.type] ?? intent.type}
      </span>
      <span className="border border-white/10 bg-[#161514]/90 px-3 py-1 font-mono text-[11px] tracking-wider text-[#F2F0E9] shadow-sm backdrop-blur-md">
        {mode === 'deep' ? '深入模式' : '快速模式'}
      </span>
      <span className="border border-white/10 bg-[#161514]/90 px-3 py-1 font-mono text-[11px] tracking-wider text-[#DCD9D0] shadow-sm backdrop-blur-md">
        召回 {intent.retrieval.lexicalHits} 词法 / {intent.retrieval.denseHits} 语义
      </span>
      {intent.needsWiderRecall > 0.5 && (
        <span className="border border-[#8B3A3A]/60 bg-[#2A1515]/90 px-3 py-1 font-mono text-[11px] tracking-wider text-[#F5C2C2] shadow-sm backdrop-blur-md">
          需要全库语义扫描
        </span>
      )}
      {facetChips.map(chip => (
        <span
          key={chip}
          className="border border-white/10 bg-[#161514]/90 px-3 py-1 font-body text-[11px] text-[#DCD9D0] shadow-sm backdrop-blur-md"
        >
          {chip}
        </span>
      ))}

      {degraded.length > 0 && (
        <span className="mt-1 w-full border border-[#8B3A3A]/40 bg-[#2A1515]/85 px-3 py-1.5 font-mono text-[11px] leading-relaxed text-[#F5C2C2] shadow-sm backdrop-blur-md">
          {degraded.slice(0, 3).map(describeDegraded).join(' · ')}
        </span>
      )}
    </div>
  );
}
