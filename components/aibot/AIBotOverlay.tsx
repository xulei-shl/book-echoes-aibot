'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import MessageStream from '@/components/aibot/MessageStream';
import DeepSearchWorkflow from '@/components/aibot/DeepSearchWorkflow';
import { useAIBotStore } from '@/store/aibot/useAIBotStore';
import type { UIMessage } from 'ai';
import type { RetrievalResultData } from '@/src/core/aibot/types';
import type { LogEntry, SearchPhase } from '@/components/aibot/ProgressLogDisplay';

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
    const [showDeepSearchWorkflow, setShowDeepSearchWorkflow] = useState(false);
    const [deepSearchInput, setDeepSearchInput] = useState('');
    const [isSearching, setIsSearching] = useState(false); // 新增：检索中状态

    // 简单检索进度日志状态
    const [simpleSearchLogs, setSimpleSearchLogs] = useState<LogEntry[]>([]);
    const [simpleSearchPhase, setSimpleSearchPhase] = useState<string>('');

    // 更新简单检索日志
    const updateSimpleSearchLog = useCallback((
        phase: SearchPhase,
        status: 'pending' | 'running' | 'completed' | 'error',
        message: string,
        details?: string
    ) => {
        const newLog: LogEntry = {
            id: `${phase}-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString('zh-CN'),
            phase,
            status,
            message,
            details
        };

        setSimpleSearchLogs(prev => {
            const existingIndex = prev.findIndex(log => log.phase === phase);
            if (existingIndex >= 0) {
                const updated = [...prev];
                updated[existingIndex] = newLog;
                return updated;
            }
            return [...prev, newLog];
        });

        setSimpleSearchPhase(phase);
    }, []);

    // 清空简单检索日志
    const clearSimpleSearchLogs = useCallback(() => {
        setSimpleSearchLogs([]);
        setSimpleSearchPhase('');
    }, []);

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

    // 调用分类器接口
    const classifyIntent = async (input: string) => {
        try {
            const response = await fetch('/api/local-aibot/classify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userInput: input,
                    messages: buildRequestMessages(messages)
                })
            });

            if (!response.ok) {
                throw new Error('分类失败');
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('[AIBotOverlay] 分类失败:', error);
            // 默认返回简单检索
            return { intent: 'simple_search', confidence: 0.5, reason: '分类服务不可用' };
        }
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

        // 立即添加用户消息到界面，无需等待分类
        const userMessage: UIMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: trimmed
        } as any;

        appendMessage(userMessage);
        setInputValue('');

        // 处理深度模式的草稿逻辑
        if (isDeepMode) {
            if (!pendingDraft) {
                // 深度模式下，所有检索需求都进入深度检索
                setDeepSearchInput(trimmed);
                setShowDeepSearchWorkflow(true);
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
            return;
        }

        // 普通模式下，并行执行分类和简单检索
        await performSimpleSearchWithClassification(trimmed);
    };

    // 执行简单检索（带分类）
    const performSimpleSearchWithClassification = async (query: string) => {
        setRetrievalPhase('search');
        setOriginalQuery(query);
        setIsSearching(true);
        clearSimpleSearchLogs(); // 清空之前的日志

        try {
            // 阶段1: 问题分类
            updateSimpleSearchLog('classify', 'running', '正在分析问题类型...');
            const [classification] = await Promise.all([
                classifyIntent(query),
            ]);
            updateSimpleSearchLog('classify', 'completed', `识别为: ${classification.intent === 'other' ? '非检索' : '图书检索'}`, classification.reason);

            // 如果是其他类型，直接返回提示
            if (classification.intent === 'other') {
                const assistantMessage: UIMessage = {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: '你好，我是 Book Echoes 图书智搜助手，专注解读与推荐书籍内容。\n当前输入暂未匹配到图书检索任务。试着告诉我：你想解决的问题、关注的主题、阅读目标或领域关键词，我就能为你找到书。'
                } as any;

                appendMessage(assistantMessage);
                setRetrievalPhase('search');
                setIsSearching(false);
                updateSimpleSearchLog('completed', 'completed', '分类完成，无需检索');
                return;
            }

            // 阶段2: 检索扩展 + 阶段3: 并行检索（API内部执行）
            updateSimpleSearchLog('expand', 'running', '正在扩展检索词...');

            // 模拟扩展完成后显示并行检索状态
            setTimeout(() => {
                updateSimpleSearchLog('expand', 'completed', '检索词扩展完成');
                updateSimpleSearchLog('parallel-search', 'running', '正在并行检索图书...');
            }, 500);

            const response = await fetch('/api/local-aibot/search-only', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query,
                    messages: buildRequestMessages(messages)
                })
            });

            if (!response.ok) {
                throw new Error('检索失败');
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message || '检索失败');
            }

            // 阶段3完成 + 阶段4: 结果合并
            updateSimpleSearchLog('parallel-search', 'completed', '并行检索完成');
            updateSimpleSearchLog('merge', 'running', '正在合并去重结果...');

            setCurrentRetrievalResult(data.retrievalResult);

            // 添加检索结果消息
            const retrievalMessage: UIMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: ''
            } as any;

            appendMessage(retrievalMessage);
            setRetrievalResult(retrievalMessage.id, data.retrievalResult);

            // 阶段4完成
            const booksCount = data.retrievalResult?.books?.length || 0;
            updateSimpleSearchLog('merge', 'completed', `找到 ${booksCount} 本相关图书`);
            updateSimpleSearchLog('completed', 'completed', '检索完成');

            // 进入选择阶段
            setRetrievalPhase('selection');

        } catch (err) {
            updateSimpleSearchLog('error', 'error', err instanceof Error ? err.message : '检索失败');
            setError(err instanceof Error ? err.message : '检索失败，请稍后重试');
            setRetrievalPhase('search');
        } finally {
            setIsSearching(false);
        }
    };

    // 执行简单检索（原方法保留，用于其他地方调用）
    const performSimpleSearch = async (query: string) => {
        setRetrievalPhase('search');
        setOriginalQuery(query);

        try {
            const response = await fetch('/api/local-aibot/search-only', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query,
                    messages: buildRequestMessages(messages)
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
                content: ''
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

    
    // 新增：重新进入选择模式
    const reenterSelection = () => {
        setRetrievalPhase('selection');
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
        setShowDeepSearchWorkflow(false);
        setDeepSearchInput('');
        
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

                    <div className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: '0' }}>
                        <div className="flex-1 overflow-hidden">
                            <div
                                className="h-full flex flex-col gap-6 py-4 pr-2 overflow-y-auto aibot-scroll"
                                style={{ minHeight: '0' }}
                            >
                                  <div className="flex-1 min-h-0" style={{ overflow: 'hidden' }}>
                                    <MessageStream
                                        messages={messages}
                                        isStreaming={isStreaming || isGeneratingInterpretation}
                                        isSearching={isSearching}
                                        retrievalPhase={retrievalPhase}
                                        selectedBookIds={selectedBookIds}
                                        onBookSelection={handleBookSelection}
                                        onGenerateInterpretation={handleGenerateInterpretation}
                                        onReenterSelection={reenterSelection}
                                        simpleSearchLogs={simpleSearchLogs}
                                        simpleSearchPhase={simpleSearchPhase}
                                    />
                                </div>

                                {/* 深度检索工作流 */}
                                {showDeepSearchWorkflow && (
                                    <DeepSearchWorkflow
                                        userInput={deepSearchInput}
                                        onInterpretationGenerated={(interpretation) => {
                                            // 添加解读消息
                                            const interpretationMessage: UIMessage = {
                                                id: crypto.randomUUID(),
                                                role: 'assistant',
                                                content: interpretation
                                            } as any;
                                            
                                            appendMessage(interpretationMessage);
                                            setShowDeepSearchWorkflow(false);
                                            setDeepSearchInput('');
                                        }}
                                        onCancel={() => {
                                            setShowDeepSearchWorkflow(false);
                                            setDeepSearchInput('');
                                        }}
                                    />
                                )}

                                {isDeepMode && (pendingDraft || isDraftLoading) && !showDeepSearchWorkflow && (
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
                            </div>
                        </div>

                        <form id="aibot-form" className="space-y-3 pt-4 border-t border-[#2E2E2E]" onSubmit={handleSubmit}>
                            <textarea
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder={isDeepMode ? '输入检索主题，先生成草稿再发送' : '想了解什么图书？'}
                                className="w-full h-24 bg-[#1B1B1B] border border-[#3A3A3A] rounded-2xl p-4 text-sm text-[#E8E6DC] focus:outline-none focus:border-[#C9A063] font-info-content"
                                disabled={isStreaming || isGeneratingInterpretation || isSearching || (isDeepMode && !!pendingDraft)}
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
                                </div>
                                <button
                                    type="submit"
                                    disabled={isStreaming || isSearching}
                                    className="px-4 py-2 rounded-full bg-[#C9A063] text-black text-sm disabled:opacity-50 font-info-content"
                                >
                                    {isSearching ? '检索中...' : isDeepMode && !pendingDraft && !showDeepSearchWorkflow ? '开始深度检索' : showDeepSearchWorkflow ? '检索进行中...' : '发送'}
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
