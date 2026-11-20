'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface AIBotPasswordGateProps {
    /** 正在向服务端确认当前会话是否已解锁 */
    checking: boolean;
    onUnlocked: () => void;
}

export default function AIBotPasswordGate({ checking, onUnlocked }: AIBotPasswordGateProps) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string>();
    const [submitting, setSubmitting] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!checking) {
            inputRef.current?.focus();
        }
    }, [checking]);

    const handleSubmit = useCallback(
        async (event: React.FormEvent) => {
            event.preventDefault();
            const value = password.trim();
            if (!value || submitting || checking) {
                return;
            }

            setSubmitting(true);
            setError(undefined);

            try {
                const response = await fetch('/api/local-aibot/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: value })
                });

                if (response.ok) {
                    setPassword('');
                    onUnlocked();
                    return;
                }

                if (response.status === 401) {
                    setError('密码错误，请重试');
                } else {
                    setError('验证失败，请稍后重试');
                }
            } catch {
                setError('网络异常，请稍后重试');
            } finally {
                setSubmitting(false);
            }
        },
        [checking, onUnlocked, password, submitting]
    );

    return (
        <div
            className="absolute inset-0 z-30 flex items-center justify-center px-4 bg-[#0E0D0C]/75 backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
        >
            <form
                onSubmit={handleSubmit}
                className="relative w-full max-w-sm border border-[#C9A063]/40 bg-[#161514]/95 px-5 sm:px-6 py-6 sm:py-7 shadow-[0_20px_60px_rgba(0,0,0,0.65)]"
            >
                <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-[#C9A063]" />
                <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-[#C9A063]" />
                <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-[#C9A063]" />
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-[#C9A063]" />

                <p className="font-mono text-[10px] tracking-[0.3em] text-[#C9A063]/60 uppercase">
                    Restricted Access
                </p>
                <h2 className="mt-2 font-display text-xl text-[#E8E6DC]">本地对话 · 访问验证</h2>
                <p className="mt-2 font-info-content text-xs text-[#A2A09A] leading-relaxed">
                    该模块已启用密码保护，请输入访问密码后继续使用。
                </p>

                <input
                    ref={inputRef}
                    type="password"
                    value={password}
                    onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError(undefined);
                    }}
                    placeholder={checking ? '正在确认访问权限...' : '请输入访问密码'}
                    autoComplete="current-password"
                    disabled={checking || submitting}
                    className="mt-5 w-full bg-[#111110] border border-[#C9A063]/25 px-3 py-2 text-sm text-[#E8E6DC] placeholder-[#7C7A74] focus:outline-none focus:border-[#C9A063] focus:ring-1 focus:ring-[#C9A063]/30 font-mono tracking-widest disabled:opacity-40 transition-colors"
                />

                {error && (
                    <p className="mt-2 font-info-content text-xs text-[#E58585]" role="alert">
                        {error}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={checking || submitting || !password.trim()}
                    className="mt-4 w-full px-4 py-2 border border-[#C9A063] bg-[#C9A063] text-[#121110] font-medium text-xs font-mono tracking-wider hover:bg-[#D4AF37] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition-[background-color,opacity,transform] duration-150"
                >
                    {checking ? '正在验证...' : submitting ? '验证中...' : '解锁进入'}
                </button>
            </form>
        </div>
    );
}
