'use client';

import type { AppliedConstraint, QueryIntent, SearchMode } from '@/lib/search/types';

const INTENT_LABELS: Record<string, string> = {
  concept: '按主题/概念找书',
  work: '找具体作品',
  similar: '找相近风格',
  list: '要一份书单',
  other: '意图未定'
};

const DEGRADED_LABELS: Record<string, string> = {
  understand: '意图理解未完成，已按关键词召回',
  'understand-class': '类目识别未完成，年份/评分等其他条件照常生效',
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

/** 生效的硬条件：让「凭什么把这些书排除了」看得见（来源与是否被丢弃在 API 里，不展示在这里） */
function describeConstraint(entry: AppliedConstraint): string {
  if (entry.field === 'pubYearFrom') return `已按 ${entry.value} 年以后出版过滤`;
  if (entry.field === 'minRating') return `已按评分 ${entry.value} 分以上过滤`;
  if (entry.field === 'excludeFiction') return '已排除虚构类';
  if (entry.field === 'callClasses') {
    // 只展示类号：类目名来自 clc.ts 那张大表，不该为了一个标签把它拉进客户端 bundle
    const codes = Array.isArray(entry.value) ? entry.value.join('、') : String(entry.value);
    return `已按中图法类目 ${codes} 过滤`;
  }
  // 新增字段却忘了在这里适配时，宁可显示中性文案也不能误报成别的条件
  return '已应用筛选条件';
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
    <div className="flex flex-col items-center gap-2.5">
      {/* 检索特征标签群：居中流式排列 */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="border border-[#C9A063]/50 bg-[#141312]/60 px-3 py-1 font-mono text-[11px] font-medium tracking-wider text-[#C9A063] shadow-md backdrop-blur-md">
          {INTENT_LABELS[intent.type] ?? intent.type}
        </span>
        <span className="border border-white/10 bg-[#141312]/60 px-3 py-1 font-mono text-[11px] tracking-wider text-[#F2F0E9] shadow-sm backdrop-blur-md">
          {mode === 'deep' ? '深入模式' : '快速模式'}
        </span>
        <span className="border border-white/10 bg-[#141312]/60 px-3 py-1 font-mono text-[11px] tracking-wider text-[#DCD9D0] shadow-sm backdrop-blur-md tabular-nums">
          召回 {intent.retrieval.lexicalHits} 词法 / {intent.retrieval.denseHits} 语义
        </span>
        {intent.needsWiderRecall > 0.5 && (
          <span className="border border-[#8B3A3A]/60 bg-[#2A1515]/65 px-3 py-1 font-mono text-[11px] tracking-wider text-[#F5C2C2] shadow-sm backdrop-blur-md">
            需要全库语义扫描
          </span>
        )}
        {intent.plan.applied.map(entry => (
          <span
            key={`${entry.field}-${entry.value}`}
            className="border border-[#C9A063]/30 bg-[#141312]/60 px-3 py-1 font-mono text-[11px] tracking-wider text-[#E5BE82] shadow-sm backdrop-blur-md"
          >
            {describeConstraint(entry)}
          </span>
        ))}
        {facetChips.map(chip => (
          <span
            key={chip}
            className="border border-white/10 bg-[#141312]/60 px-3 py-1 font-body text-[11px] text-[#DCD9D0] shadow-sm backdrop-blur-md"
          >
            {chip}
          </span>
        ))}
      </div>

      {/* 降级与异常提示：紧凑居中自适应细条，彻底告别空洞的全宽占位 */}
      {degraded.length > 0 && (
        <div className="inline-flex items-center gap-2 border border-[#8B3A3A]/50 bg-[#2A1515]/75 px-3 py-1 font-mono text-[11px] text-[#F5C2C2] shadow-md backdrop-blur-md">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#E06C75] animate-pulse" />
          <span>{degraded.slice(0, 3).map(describeDegraded).join(' · ')}</span>
        </div>
      )}
    </div>
  );
}
