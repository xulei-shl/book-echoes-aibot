'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import MessageStream from '@/components/aibot/MessageStream';
import { useAIBotStore } from '@/store/aibot/useAIBotStore';
import type { UIMessage } from 'ai';
import type { RetrievalResultData } from '@/src/core/aibot/types';

const buildRequestMessages = (messages: UIMessage[]) =>
    messages.map((message) => ({
        role: message.role,
        content: (message as any).content
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
        setRetrievalResult,
        
        // 新增状态
        retrievalPhase,
        currentRetrievalResult,
        selectedBookIds,
        originalQuery,
        isGeneratingInterpretation,
        setRetrievalPhase,
        setCurrentRetrievalResult,
        setSelectedBookIds,
        setOriginalQuery,
        setIsGeneratingInterpretation,
        addSelectedBook,
        removeSelectedBook,
        clearSelection,
    } = useAIBotStore();

    type Message = UIMessage;

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
                return (messages[i] as any).content as string;
            }
        }
        return '';
    }, [messages]);

    const closeOverlay = () => {
        console.log('[AIBotOverlay] 关闭对话框，重置所有状态', {
            currentMessages: messages.length,
            currentDeepMode: isDeepMode,
            hasPendingDraft: !!pendingDraft
        });
        toggleOverlay(false);
        setInputValue('');
        setDraftEditorValue('');
        setMessages([]);
        setPendingDraft(null, undefined);
        setError(undefined);
        console.log('[AIBotOverlay] 状态重置完成');
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
        
        const requestBody = {
            mode,
            messages: buildRequestMessages(currentMessages),
            ...extraBody
        };
        
        console.log('[AIBotOverlay] streamAssistant 发送请求', {
            mode,
            messagesCount: currentMessages.length,
            hasExtraBody: !!extraBody,
            extraBodyKeys: extraBody ? Object.keys(extraBody) : [],
            requestBody: {
                ...requestBody,
                messages: requestBody.messages.map(msg => ({ role: msg.role }))
            }
        });
        
        try {
            const response = await fetch('/api/local-aibot/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok || !response.body) {
                const fallback = await response.text();
                throw new Error(fallback || '响应异常');
            }

            // 解析检索结果
            const retrievalResultHeader = response.headers.get('X-Retrieval-Result');
            const retrievalResultEncoded = response.headers.get('X-Retrieval-Result-Encoded');
            let retrievalResultData: RetrievalResultData | undefined;
            
            if (retrievalResultHeader) {
                try {
                    if (retrievalResultEncoded === 'base64') {
                        // 解码 base64 编码的 JSON
                        const decodedJson = Buffer.from(retrievalResultHeader, 'base64').toString('utf8');
                        retrievalResultData = JSON.parse(decodedJson);
                    } else {
                        // 直接解析 JSON（向后兼容）
                        retrievalResultData = JSON.parse(retrievalResultHeader);
                    }
                } catch (error) {
                    console.error('解析检索结果失败:', error);
                }
            }

            const assistantMessage: UIMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: ''
            } as any;
            
            appendMessage(assistantMessage);
            
            // 如果有检索结果，存储到状态中
            if (retrievalResultData) {
                setRetrievalResult(assistantMessage.id, retrievalResultData);
            }

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

        console.log('[AIBotOverlay] handleSubmit', {
            trimmed,
            isDeepMode,
            hasPendingDraft: !!pendingDraft,
            currentMessagesCount: messages.length,
            currentMessages: messages.map(msg => ({ role: msg.role })),
            currentRetrievalPhase: retrievalPhase
        });

        if (!trimmed && !(isDeepMode && pendingDraft)) {
            setError('请输入内容');
            return;
        }

        if (isDeepMode) {
            if (!pendingDraft) {
                const userMessage: UIMessage = {
                    id: crypto.randomUUID(),
                    role: 'user',
                    content: trimmed
                } as any;
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
            setPendingDraft(null, mergedMetadata as any);
            setInputValue('');
            return;
        }

        // 简单检索：先执行检索，不直接调用AI
        await performSimpleSearch(trimmed);
    };

    // 新增：执行简单检索
    const performSimpleSearch = async (query: string) => {
        setRetrievalPhase('search');
        setOriginalQuery(query);
        
        const userMessage: UIMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: query
        } as any;
        
        const nextMessages = [...messages, userMessage];
        appendMessage(userMessage);
        setMessages(nextMessages);
        setInputValue('');
        
        try {
            const response = await fetch('/api/local-aibot/search-only', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query,
                    messages: buildRequestMessages(nextMessages)
                })
            });

            if (!response.ok) {
                throw new Error('检索失败');
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message || '检索失败');
            }

            setCurrentRetrievalResult(data.retrievalResult);
            
            // 添加检索结果消息
            const retrievalMessage: UIMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: '请选择相关图书进行解读'
            } as any;
            
            appendMessage(retrievalMessage);
            setRetrievalResult(retrievalMessage.id, data.retrievalResult);
            
            // 进入选择阶段
            setRetrievalPhase('selection');
            
        } catch (err) {
            setError(err instanceof Error ? err.message : '检索失败，请稍后重试');
            setRetrievalPhase('search');
        }
    };

    // 新增：处理图书选择
    const handleBookSelection = (bookId: string, isSelected: boolean) => {
        if (isSelected) {
            addSelectedBook(bookId);
        } else {
            removeSelectedBook(bookId);
        }
    };

    // 新增：处理解读生成
    const handleGenerateInterpretation = async (selectedBookIds: Set<string>) => {
        if (selectedBookIds.size === 0) {
            setError('请至少选择一本图书');
            return;
        }

        setRetrievalPhase('interpretation');
        setIsGeneratingInterpretation(true);
        
        try {
            const selectedBooks = currentRetrievalResult?.books.filter(book => 
                selectedBookIds.has(book.id)
            ) || [];

            const response = await fetch('/api/local-aibot/generate-interpretation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    originalQuery,
                    selectedBooks,
                    messages: buildRequestMessages(messages)
                })
            });

            if (!response.ok || !response.body) {
                throw new Error('生成解读失败');
            }

            // 添加解读消息
            const interpretationMessage: UIMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: ''
            } as any;
            
            appendMessage(interpretationMessage);

            // 流式读取解读内容
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                updateLastAssistantMessage(buffer);
            }

            setRetrievalPhase('completed');
            clearSelection();
            
        } catch (err) {
            setError(err instanceof Error ? err.message : '生成解读失败');
            setRetrievalPhase('selection');
        } finally {
            setIsGeneratingInterpretation(false);
        }
    };

    // 新增：取消选择
    const cancelSelection = () => {
        clearSelection();
        setRetrievalPhase('search');
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

    const handleClear = async () => {
        console.log('[AIBotOverlay] 清空聊天记录', {
            currentMessages: messages.length,
            currentDeepMode: isDeepMode
        });
        
        // 清空前端状态
        setMessages([]);
        setInputValue('');
        setDraftEditorValue('');
        setPendingDraft(null, undefined);
        setError(undefined);
        
        // 清空后端历史记录
        try {
            await fetch('/api/local-aibot/clear', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            console.log('[AIBotOverlay] 后端历史记录已清空');
        } catch (err) {
            console.error('[AIBotOverlay] 清空后端历史记录失败:', err);
            setError('清空历史记录失败，请稍后重试');
            setTimeout(() => setError(undefined), 2000);
        }
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
                        style={{ minHeight: '0' }} // 确保flex容器可以正确计算高度
                    >
                    <header className="flex items-center justify-between pb-4 border-b border-[#2E2E2E]">
                        <div className="font-info-content">
                            <p className="text-sm text-[#A2A09A]">AIBot 本地对话</p>
                            <p className="text-xs text-[#6F6D68]">仅限本地调试，云端默认关闭</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={closeOverlay}
                                className="text-[#A2A09A] hover:text-white transition-colors"
                            >
                                ✕
                            </button>
                        </div>
                    </header>

                    <div className="flex-1 flex flex-col gap-6 py-4 overflow-hidden" style={{ minHeight: '0' }}>
                        {/* 调试日志：检查容器高度 */}
                        {process.env.NODE_ENV === 'development' && (
                            <div className="text-xs text-[#6F6D68] mb-2 bg-[#1B1B1B] p-2 rounded font-info-content">
                                [DEBUG] 容器诊断 - 消息数量: {messages.length}, 流式状态: {isStreaming ? '是' : '否'}
                                <br />草稿状态: {pendingDraft ? '有' : '无'}, 草稿加载: {isDraftLoading ? '是' : '否'}
                            </div>
                        )}
                        <div className="flex-1" style={{ minHeight: '0', overflow: 'hidden' }}>
                            <MessageStream 
                                messages={messages} 
                                isStreaming={isStreaming || isGeneratingInterpretation}
                                retrievalPhase={retrievalPhase}
                                selectedBookIds={selectedBookIds}
                                onBookSelection={handleBookSelection}
                                onGenerateInterpretation={handleGenerateInterpretation}
                                onCancelSelection={cancelSelection}
                            />
                        </div>

                        {isDeepMode && (pendingDraft || isDraftLoading) && (
                            <div className="border border-[#2E2E2E] rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between text-sm text-[#C9A063] font-info-content">
                                    <span>草稿确认</span>
                                    {isDraftLoading && <span className="animate-pulse text-xs">生成中...</span>}
                                </div>
                                <textarea
                                    value={draftEditorValue}
                                    onChange={(e) => {
                                        setDraftEditorValue(e.target.value);
                                        setPendingDraft(e.target.value, {
                                            userInput: e.target.value,
                                            searchSnippets: (draftMetadata?.searchSnippets) || [],
                                            articleAnalysis: (draftMetadata?.articleAnalysis) || '',
                                            crossAnalysis: (draftMetadata?.crossAnalysis) || '',
                                            draftMarkdown: e.target.value
                                        });
                                    }}
                                    className="w-full h-32 rounded-xl bg-[#1B1B1B] border border-[#3A3A3A] text-sm text-[#E8E6DC] p-3 focus:outline-none focus:border-[#C9A063] font-info-content"
                                />
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setPendingDraft(null, undefined)}
                                        className="text-xs px-3 py-1 border border-[#3A3A3A] rounded-full text-[#A2A09A] font-info-content"
                                    >
                                        丢弃草稿
                                    </button>
                                    <button
                                        type="submit"
                                        form="aibot-form"
                                        className="text-xs px-4 py-1 rounded-full bg-[#C9A063] text-black font-info-content"
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
                                className="w-full h-24 bg-[#1B1B1B] border border-[#3A3A3A] rounded-2xl p-4 text-sm text-[#E8E6DC] focus:outline-none focus:border-[#C9A063] font-info-content"
                                disabled={isStreaming || isGeneratingInterpretation || (isDeepMode && !!pendingDraft)}
                            />
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 text-xs text-[#7C7A74]">
                                    <button
                                        type="button"
                                        className={clsx(
                                            'px-3 py-1 rounded-full border font-info-content',
                                            isDeepMode ? 'border-[#C9A063] text-[#C9A063]' : 'border-[#3A3A3A] text-[#A2A09A]'
                                        )}
                                        onClick={() => setDeepMode(!isDeepMode)}
                                    >
                                        {isDeepMode ? '深度检索已开启' : '深度检索关闭'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleClear}
                                        disabled={isStreaming}
                                        className="hover:text-white transition-colors disabled:cursor-not-allowed disabled:text-[#555] font-info-content"
                                    >
                                        清空
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCopy}
                                        className="hover:text-white transition-colors font-info-content"
                                    >
                                        复制
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleRetry}
                                        disabled={isStreaming}
                                        className="hover:text-white transition-colors disabled:cursor-not-allowed disabled:text-[#555] font-info-content"
                                    >
                                        重试
                                    </button>
                                </div>
                                <button
                                    type="submit"
                                    disabled={isStreaming}
                                    className="px-4 py-2 rounded-full bg-[#C9A063] text-black text-sm disabled:opacity-50 font-info-content"
                                >
                                    {isDeepMode && !pendingDraft ? '生成草稿' : '发送'}
                                </button>
                            </div>
                        </form>

                        {error && (
                            <p className="text-xs text-[#C76B6B] font-info-content">
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
