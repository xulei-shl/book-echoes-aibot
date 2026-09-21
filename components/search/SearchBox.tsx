'use client';

import { useEffect, useState } from 'react';
import type { SearchMode } from '@/lib/search/types';

/** 打字机文案循环（真实阶段事件在 NDJSON 流式版本接入，此处与后端等待期对齐） */
const STAGE_MESSAGES = [
  '正在理解你的问题…',
  '正在提取语义特征…',
  '正在比对馆藏…',
  '正在生成排序…'
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
        }, 900);
      }
    }, 80);
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (advance) clearTimeout(advance);
    };
  }, [index, messages]);

  return (
    <span className="font-mono text-xs tracking-wider text-[#C9A063]">
      {text}
      <span className="animate-pulse">▍</span>
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
  onModeChange
}: SearchBoxProps) {
  return (
    <div className="w-full">
      <form
        onSubmit={event => {
          event.preventDefault();
          onSubmit();
        }}
        className={`relative flex items-center gap-3 rounded-3xl border bg-[#1a1a1a]/55 px-5 py-4 backdrop-blur-xl transition-all duration-500 md:px-6 md:py-5 ${
          isFocused
            ? 'border-[#C9A063]/70 shadow-[0_24px_70px_rgba(0,0,0,0.55)] ring-2 ring-[#C9A063]/40'
            : 'border-[#C9A063]/30 shadow-[0_20px_60px_rgba(0,0,0,0.45)]'
        }`}
      >
        <svg
          className="h-5 w-5 shrink-0 text-[#C9A063]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
          />
        </svg>

        <input
          value={value}
          onChange={event => onChange(event.target.value)}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          placeholder="描述你想读的书，或输入书名 / 作者 / 索书号"
          maxLength={300}
          aria-label="语义检索"
          className="min-w-0 flex-1 bg-transparent font-body text-base text-[#E8E6DC] outline-none placeholder:text-[#6F6D68] md:text-lg"
        />

        {value.length > 0 && !isSearching && (
          <button
            type="button"
            onClick={onClear}
            aria-label="清空"
            className="shrink-0 text-[#6F6D68] transition-colors hover:text-[#E8E6DC]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        <button
          type="submit"
          disabled={isSearching || value.trim().length === 0}
          aria-label="检索"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#C9A063] text-[#1a1a1a] transition-all duration-300 hover:bg-[#D4A574] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSearching ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          )}
        </button>
      </form>

      <div className="mt-3 flex min-h-6 items-center justify-between gap-4 px-1">
        <div>
          {isSearching ? (
            <Typewriter messages={STAGE_MESSAGES} />
          ) : (
            <span className="font-mono text-xs tracking-wider text-[#6F6D68]">
              词法 + 稠密双 lane 召回 · Jev 逐本判定
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-full border border-[#C9A063]/25 p-0.5">
          {(['fast', 'deep'] as const).map(option => (
            <button
              key={option}
              type="button"
              onClick={() => onModeChange(option)}
              className={`rounded-full px-3 py-1 font-mono text-[11px] tracking-wider transition-colors duration-300 ${
                mode === option
                  ? 'bg-[#C9A063] text-[#1a1a1a]'
                  : 'text-[#A2A09A] hover:text-[#E8E6DC]'
              }`}
              title={option === 'fast' ? '快速：2 次语义判定' : '深入：补发全库语义宽召回'}
            >
              {option === 'fast' ? '快速' : '深入'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
