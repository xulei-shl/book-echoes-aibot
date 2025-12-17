'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import MessageStream from '@/components/aibot/MessageStream';
import { useAIBotStore } from '@/store/aibot/useAIBotStore';
import type { Message } from 'ai';

const buildRequestMessages = (messages: Message[]) =>
    messages.map((message) => ({
        role: message.role,
        content: message.content
    }));

export default function AIBotOverlay() {
    const {
        isOverlayOpen,
        toggleOverlay,
        isDeepMode,
        setDeepMode,
        messages,
        setMessages,
        appendMessage,
        updateLastAssistantMessage,
        isStreaming,
        setStreaming,
        pendingDraft,
        draftMetadata,
        setPendingDraft,
        isDraftLoading,
        setDraftLoading,
        error,
        setError,
    } = useAIBotStore();

    const [inputValue, setInputValue] = useState('');
    const [draftEditorValue, setDraftEditorValue] = useState('');
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        if (pendingDraft) {
            setDraftEditorValue(pendingDraft);
        }
    }, [pendingDraft]);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const lastAssistant = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i -= 1) {
            if (messages[i].role === 'assistant') {
                return messages[i].content;
            }
        }
        return '';
    }, [messages]);

    const closeOverlay = () => {
        toggleOverlay(false);
        setInputValue('');
        setDraftEditorValue('');
        setMessages([]);
        setPendingDraft(null, null);
        setError(undefined);
    };

    const requestDraft = async (question: string) => {
        if (!question) {
            setError('请输入问题后再生成草稿');
            return;
        }
        setDraftLoading(true);
        setError(undefined);
        try {
            const response = await fetch('/api/local-aibot/draft', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ user_input: question })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.message ?? '生成草稿失败');
            }
            const normalized = {
                userInput: question,
                draftMarkdown: data.draft_markdown,
                searchSnippets: data.search_snippets ?? [],
                articleAnalysis: data.article_analysis ?? '',
                crossAnalysis: data.article_cross_analysis ?? ''
            };
            setPendingDraft(normalized.draftMarkdown, normalized);
            setDraftEditorValue(normalized.draftMarkdown);
        } catch (err) {
            setError(err instanceof Error ? err.message : '生成草稿失败');
        } finally {
            setDraftLoading(false);
        }
    };

    const streamAssistant = async (
        mode: 'text-search' | 'deep',
        currentMessages: Message[],
        extraBody?: Record<string, unknown>
    ) => {
        setStreaming(true);
        setError(undefined);
        try {
            const response = await fetch('/api/local-aibot/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    mode,
                    messages: buildRequestMessages(currentMessages),
                    ...extraBody
                })
            });

            if (!response.ok || !response.body) {
                const fallback = await response.text();
                throw new Error(fallback || '响应异常');
            }

            const assistantMessage: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: ''
            };
            appendMessage(assistantMessage);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                updateLastAssistantMessage(buffer);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '请求失败，请稍后重试');
        } finally {
            setStreaming(false);
        }
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmed = inputValue.trim();

        if (!trimmed && !(isDeepMode && pendingDraft)) {
            setError('请输入内容');
            return;
        }

        if (isDeepMode) {
            if (!pendingDraft) {
                const userMessage: Message = {
                    id: crypto.randomUUID(),
                    role: 'user',
                    content: trimmed
                };
                const nextMessages = [...messages, userMessage];
                appendMessage(userMessage);
                setInputValue('');
                await requestDraft(trimmed);
                setMessages(nextMessages);
                return;
            }

            const draftText = draftEditorValue.trim();
            if (!draftText) {
                setError('草稿为空，请先调整内容');
                return;
            }
            const mergedMetadata = {
                ...(draftMetadata ?? {}),
                draftMarkdown: draftText
            };
            await streamAssistant('deep', messages, {
                draft_markdown: draftText,
                deep_metadata: mergedMetadata
            });
            setPendingDraft(null, mergedMetadata);
            setInputValue('');
            return;
        }

        const userMessage: Message = {
            id: crypto.randomUUID(),
            role: 'user',
            content: trimmed
        };
        const nextMessages = [...messages, userMessage];
        appendMessage(userMessage);
        setMessages(nextMessages);
        setInputValue('');
        await streamAssistant('text-search', nextMessages);
    };

    const handleRetry = async () => {
        if (!messages.length) return;
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role !== 'assistant') return;
        const retriedMessages = messages.slice(0, -1);
        setMessages(retriedMessages);
        if (isDeepMode) {
            const mergedMetadata = {
                ...(draftMetadata ?? {}),
                draftMarkdown: draftEditorValue || draftMetadata?.draftMarkdown || ''
            };
            await streamAssistant('deep', retriedMessages, {
                draft_markdown: mergedMetadata.draftMarkdown,
                deep_metadata: mergedMetadata
            });
            return;
        }
        await streamAssistant('text-search', retriedMessages);
    };

    const handleCopy = async () => {
        if (!lastAssistant) {
            setError('暂无可复制内容');
            return;
        }
        await navigator.clipboard.writeText(lastAssistant);
        setError('已复制到剪贴板');
        setTimeout(() => setError(undefined), 2000);
    };

    if (!isMounted) {
        return null;
    }

    return createPortal(
        <AnimatePresence>
            {isOverlayOpen && (
                <motion.div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[160]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={closeOverlay}
                >
                    <motion.div
                        className="absolute inset-x-4 md:inset-x-24 top-10 bottom-10 bg-[#111111] border border-[#2E2E2E] rounded-3xl flex flex-col px-8 py-6"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                    <header className="flex items-center justify-between pb-4 border-b border-[#2E2E2E]">
                        <div>
                            <p className="text-sm text-[#A2A09A]">AIBot 本地对话</p>
                            <p className="text-xs text-[#6F6D68]">仅限本地调试，云端默认关闭</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                className={clsx(
                                    'text-xs px-3 py-1 rounded-full border',
                                    isDeepMode ? 'border-[#C9A063] text-[#C9A063]' : 'border-[#3A3A3A] text-[#A2A09A]'
                                )}
                                onClick={() => setDeepMode(!isDeepMode)}
                            >
                                {isDeepMode ? '深度检索已开启' : '深度检索关闭'}
                            </button>
                            <button
                                type="button"
                                onClick={closeOverlay}
                                className="text-[#A2A09A] hover:text-white transition-colors"
                            >
                                ✕
                            </button>
                        </div>
                    </header>

                    <div className="flex-1 flex flex-col gap-6 py-4">
                        <MessageStream messages={messages} isStreaming={isStreaming} />

                        {isDeepMode && (pendingDraft || isDraftLoading) && (
                            <div className="border border-[#2E2E2E] rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between text-sm text-[#C9A063]">
                                    <span>草稿确认</span>
                                    {isDraftLoading && <span className="animate-pulse text-xs">生成中...</span>}
                                </div>
                                <textarea
                                    value={draftEditorValue}
                                    onChange={(e) => {
                                        setDraftEditorValue(e.target.value);
                                        setPendingDraft(e.target.value, {
                                            ...(draftMetadata ?? {}),
                                            draftMarkdown: e.target.value
                                        });
                                    }}
                                    className="w-full h-32 rounded-xl bg-[#1B1B1B] border border-[#3A3A3A] text-sm text-[#E8E6DC] p-3 focus:outline-none focus:border-[#C9A063]"
                                />
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setPendingDraft(null, null)}
                                        className="text-xs px-3 py-1 border border-[#3A3A3A] rounded-full text-[#A2A09A]"
                                    >
                                        丢弃草稿
                                    </button>
                                    <button
                                        type="submit"
                                        form="aibot-form"
                                        className="text-xs px-4 py-1 rounded-full bg-[#C9A063] text-black"
                                    >
                                        确认发送
                                    </button>
                                </div>
                            </div>
                        )}

                        <form id="aibot-form" className="space-y-3" onSubmit={handleSubmit}>
                            <textarea
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder={isDeepMode ? '输入检索主题，先生成草稿再发送' : '想了解什么图书？'}
                                className="w-full h-24 bg-[#1B1B1B] border border-[#3A3A3A] rounded-2xl p-4 text-sm text-[#E8E6DC] focus:outline-none focus:border-[#C9A063]"
                                disabled={isStreaming || (isDeepMode && !!pendingDraft)}
                            />
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 text-xs text-[#7C7A74]">
                                    <button
                                        type="button"
                                        onClick={handleCopy}
                                        className="hover:text-white transition-colors"
                                    >
                                        复制
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleRetry}
                                        disabled={isStreaming}
                                        className="hover:text-white transition-colors disabled:cursor-not-allowed disabled:text-[#555]"
                                    >
                                        重试
                                    </button>
                                </div>
                                <button
                                    type="submit"
                                    disabled={isStreaming}
                                    className="px-4 py-2 rounded-full bg-[#C9A063] text-black text-sm disabled:opacity-50"
                                >
                                    {isDeepMode && !pendingDraft ? '生成草稿' : '发送'}
                                </button>
                            </div>
                        </form>

                        {error && (
                            <p className="text-xs text-[#C76B6B]">
                                {error}
                            </p>
                        )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
