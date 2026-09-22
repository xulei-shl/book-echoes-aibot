'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { SearchMode } from '@/lib/search/types';

/** 打字机文案循环（真实阶段事件在 NDJSON 流式版本接入，此处与后端等待期对齐） */
const STAGE_MESSAGES = [
  '正在理解检索意图…',
  '正在提取多维语义特征…',
  '正在与全馆 443 本藏书空间比对…',
  '正在由 Jev 进行语义判定与排序…'
];

function Typewriter({ messages }: { messages: string[] }) {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState('');

  useEffect(() => {
    const full = messages[index % messages.length];
    let char = 0;
    let cancelled = false;
    let advance: ReturnType<typeof setTimeout> | undefined;
    const timer = setInterval(() => {
      if (cancelled) return;
      char += 1;
      setText(full.slice(0, char));
      if (char >= full.length) {
        clearInterval(timer);
        advance = setTimeout(() => {
          if (!cancelled) setIndex(value => value + 1);
        }, 1200);
      }
    }, 70);
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (advance) clearTimeout(advance);
    };
  }, [index, messages]);

  return (
    <span className="inline-flex items-center gap-1.5 border border-[#C9A063]/30 bg-[#141312]/60 px-3 py-1 font-body text-xs tracking-wider text-[#E5BE82] shadow-md backdrop-blur-md tabular-nums">
      <span>{text}</span>
      <span className="inline-block h-3 w-1 bg-[#C9A063] animate-pulse" />
    </span>
  );
}

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  onFocusChange: (focused: boolean) => void;
  isSearching: boolean;
  isFocused: boolean;
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  hasActiveSearch?: boolean;
}

export default function SearchBox({
  value,
  onChange,
  onSubmit,
  onClear,
  onFocusChange,
  isSearching,
  isFocused,
  mode,
  onModeChange,
  hasActiveSearch = false
}: SearchBoxProps) {
  return (
    <div className="w-full">
      <form
        onSubmit={event => {
          event.preventDefault();
          onSubmit();
        }}
        className={`relative flex items-center gap-3.5 border px-5 py-3.5 backdrop-blur-2xl transition-[border-color,background-color,box-shadow] duration-200 md:px-6 md:py-4.5 ${
          isFocused
            ? 'border-[#C9A063] bg-[#181716]/82 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85),0_0_28px_rgba(201,160,99,0.22)] ring-1 ring-[#C9A063]/50'
            : 'border-[#C9A063]/30 bg-[#141312]/65 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7),0_0_20px_rgba(201,160,99,0.06)] hover:border-[#C9A063]/50'
        }`}
      >
        {/* 四角高亮装饰：与全站直角设计语言一致 */}
        <div className="pointer-events-none absolute -top-px -left-px h-4 w-4 border-t-2 border-l-2 border-[#C9A063] z-10" />
        <div className="pointer-events-none absolute -top-px -right-px h-4 w-4 border-t-2 border-r-2 border-[#C9A063] z-10" />
        <div className="pointer-events-none absolute -bottom-px -left-px h-4 w-4 border-b-2 border-l-2 border-[#C9A063] z-10" />
        <div className="pointer-events-none absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-[#C9A063] z-10" />

        {/* 借阅卡铜标纹章 / 搜索微标 */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#C9A063]/10 text-[#C9A063]">
          <svg
            className="h-4.5 w-4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
            />
          </svg>
        </div>

        <input
          value={value}
          onChange={event => onChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              onClear();
            }
          }}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          placeholder="描述你想读的书，或输入书名 / 作者 / 主题线索"
          maxLength={300}
          aria-label="图书语义检索"
          className="min-w-0 flex-1 bg-transparent font-body text-base text-[#F2F0E9] outline-none placeholder:text-[#A8A59E] md:text-lg"
        />

        {(value.length > 0 || hasActiveSearch) && !isSearching && (
          <motion.button
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={onClear}
            aria-label={value.length > 0 ? '清空输入' : '退出检索状态'}
            title={value.length > 0 ? '清空输入' : '退出检索状态'}
            className="flex h-7 w-7 shrink-0 items-center justify-center text-[#B8B5AD] transition-colors hover:bg-white/10 hover:text-[#F2F0E9]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </motion.button>
        )}

        {/* 提交动作胶囊按钮 */}
        <motion.button
          whileTap={{ scale: 0.96 }}
          type="submit"
          disabled={isSearching || value.trim().length === 0}
          aria-label="开始语义检索"
          className="relative flex h-9.5 w-9.5 shrink-0 items-center justify-center bg-[#C9A063] text-[#161514] shadow-md transition-[background-color,opacity] duration-150 hover:bg-[#D4A574] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-[#C9A063]"
        >
          {isSearching ? (
            <svg className="h-4.5 w-4.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          ) : (
            <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          )}
        </motion.button>
      </form>

      {/* 底部状态微调栏：打字机反馈与模式胶囊 */}
      <div className="mt-3.5 flex min-h-6 items-center justify-between gap-4 px-2 text-xs">
        <div className="min-w-0 flex-1">
          {isSearching && <Typewriter messages={STAGE_MESSAGES} />}
        </div>

        <div className="flex items-center gap-1 border border-[#C9A063]/40 bg-[#141312]/60 p-0.5 shadow-md backdrop-blur-md">
          {(['fast', 'deep'] as const).map(option => (
            <motion.button
              key={option}
              whileTap={{ scale: 0.96 }}
              type="button"
              onClick={() => onModeChange(option)}
              className={`px-2.5 py-0.5 font-mono text-[11px] tracking-wider transition-[background-color,color] duration-150 ${
                mode === option
                  ? 'bg-[#C9A063] font-medium text-[#161514] shadow-sm'
                  : 'text-[#DCD9D0] hover:text-[#F2F0E9]'
              }`}
              title={option === 'fast' ? '快速模式：两阶段语义判定' : '深入模式：补发全馆宽召回'}
            >
              {option === 'fast' ? '快速' : '深入'}
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
