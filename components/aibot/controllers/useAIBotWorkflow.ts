'use client';

import { useReducer, useRef, useCallback, useEffect } from 'react';
import {
    pipelineReducer,
    initialPipelineState
} from './pipelineReducer';
import type {
    PipelineSource,
    PipelineProgressLog
} from '@/types/aibot-pipeline';
import type {
    BookInfo,
    UploadedDocument,
    DuckDuckGoSnippet,
    KeywordResult
} from '@/src/core/aibot/types';
import { useAIBotStore } from '@/store/aibot/useAIBotStore';

const generateUUID = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};

export function useAIBotWorkflow() {
    const [state, dispatch] = useReducer(pipelineReducer, initialPipelineState);
    const abortRef = useRef<AbortController | null>(null);

    const {
        appendMessage,
        updateMessageContent,
        setRetrievalResult,
        setMode
    } = useAIBotStore();

    // 终止当前所有进行中的网络请求与流式读取
    const cancelOngoing = useCallback(() => {
        if (abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }
    }, []);

    // 关闭弹窗或重置时：物理中断请求 + 状态原子归零
    const reset = useCallback(() => {
        cancelOngoing();
        dispatch({ type: 'RESET' });
    }, [cancelOngoing]);

    // 组件卸载时自动销毁
    useEffect(() => {
        return () => {
            cancelOngoing();
        };
    }, [cancelOngoing]);

    // 创建新的 AbortController
    const getNewSignal = useCallback(() => {
        cancelOngoing();
        const controller = new AbortController();
        abortRef.current = controller;
        return controller.signal;
    }, [cancelOngoing]);

    // ========== 1. 简单检索模式 ==========
    const startSimpleSearch = useCallback(
        async (query: string) => {
            const signal = getNewSignal();
            dispatch({ type: 'START_ANALYSIS', source: 'simple', initialPhase: 'search' });

            const userMessageId = generateUUID();
            appendMessage({
                id: userMessageId,
                role: 'user',
                content: query
            });

            const assistantMessageId = generateUUID();
            appendMessage({
                id: assistantMessageId,
                role: 'assistant',
                content: ''
            });

            try {
                const response = await fetch('/api/local-aibot/search-only', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query }),
                    signal
                });

                if (!response.ok) {
                    throw new Error('简单检索失败');
                }

                const result = await response.json();
                if (result.retrievalResult) {
                    const books: BookInfo[] = result.retrievalResult.books || [];
                    setRetrievalResult(assistantMessageId, result.retrievalResult);
                    dispatch({
                        type: 'SET_BOOKS',
                        source: 'simple',
                        userInput: query,
                        books
                    });
                } else {
                    dispatch({
                        type: 'SET_ERROR',
                        source: 'simple',
                        error: '未检索到相关图书'
                    });
                }
            } catch (err: unknown) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                const errorMsg = err instanceof Error ? err.message : '简单检索发生异常';
                dispatch({ type: 'SET_ERROR', source: 'simple', error: errorMsg });
            }
        },
        [appendMessage, getNewSignal, setRetrievalResult]
    );

    // ========== 2. 深度检索模式 ==========
    const startDeepSearch = useCallback(
        async (query: string) => {
            const signal = getNewSignal();
            dispatch({ type: 'START_ANALYSIS', source: 'deep', initialPhase: 'keyword' });
            setMode('deep');

            appendMessage({
                id: generateUUID(),
                role: 'user',
                content: query
            });

            const progressMessageId = generateUUID();
            appendMessage({
                id: progressMessageId,
                role: 'assistant',
                content: {
                    type: 'deep-search-progress',
                    logs: [],
                    currentPhase: 'keyword'
                }
            });

            let draftMessageId: string | null = null;
            let accumulatedDraft = '';
            let localKeywords: KeywordResult[] = [];
            let localSnippets: DuckDuckGoSnippet[] = [];
            const runningLogs: PipelineProgressLog[] = [];

            try {
                const response = await fetch('/api/local-aibot/deep-search-analysis', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userInput: query }),
                    signal
                });

                if (!response.ok || !response.body) {
                    throw new Error('深度检索分析失败');
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));

                                if (data.type === 'progress') {
                                    const logEntry: PipelineProgressLog = {
                                        id: `${data.phase}-${Date.now()}`,
                                        timestamp: new Date().toLocaleTimeString('zh-CN'),
                                        phase: data.phase,
                                        status: data.status,
                                        message: data.message,
                                        details: data.details
                                    };
                                    runningLogs.push(logEntry);
                                    dispatch({
                                        type: 'APPEND_LOG',
                                        log: logEntry,
                                        currentPhase: data.phase
                                    });

                                    updateMessageContent(progressMessageId, {
                                        type: 'deep-search-progress',
                                        logs: runningLogs,
                                        currentPhase: data.phase
                                    });
                                } else if (data.type === 'draft-start') {
                                    localKeywords = data.keywords || [];
                                    localSnippets = data.searchSnippets || [];
                                    draftMessageId = generateUUID();

                                    appendMessage({
                                        id: draftMessageId,
                                        role: 'assistant',
                                        content: {
                                            type: 'deep-search-draft',
                                            draftMarkdown: '',
                                            isStreaming: true,
                                            isComplete: false,
                                            searchSnippets: localSnippets,
                                            keywords: localKeywords,
                                            userInput: query
                                        }
                                    });
                                } else if (data.type === 'draft-chunk') {
                                    accumulatedDraft += data.content;
                                    if (draftMessageId) {
                                        updateMessageContent(draftMessageId, {
                                            type: 'deep-search-draft',
                                            draftMarkdown: accumulatedDraft,
                                            isStreaming: true,
                                            isComplete: false,
                                            searchSnippets: localSnippets,
                                            keywords: localKeywords,
                                            userInput: query
                                        });
                                    }
                                } else if (data.type === 'draft-complete') {
                                    const finalDraft = data.draftMarkdown || accumulatedDraft;
                                    if (draftMessageId) {
                                        updateMessageContent(draftMessageId, {
                                            type: 'deep-search-draft',
                                            draftMarkdown: finalDraft,
                                            isStreaming: false,
                                            isComplete: true,
                                            searchSnippets: localSnippets,
                                            keywords: localKeywords,
                                            userInput: query
                                        });
                                    }
                                    dispatch({
                                        type: 'SET_DRAFT',
                                        source: 'deep',
                                        userInput: query,
                                        draftMarkdown: finalDraft,
                                        metadata: {
                                            keywords: localKeywords,
                                            searchSnippets: localSnippets
                                        }
                                    });
                                }
                            } catch {
                                // 忽略坏帧
                            }
                        }
                    }
                }
            } catch (err: unknown) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                const errorMsg = err instanceof Error ? err.message : '深度检索分析失败';
                dispatch({ type: 'SET_ERROR', source: 'deep', error: errorMsg });
            }
        },
        [appendMessage, getNewSignal, setMode, updateMessageContent]
    );

    // ========== 3. 文档分析模式 ==========
    const startDocumentAnalysis = useCallback(
        async (documents: UploadedDocument[]) => {
            const signal = getNewSignal();
            dispatch({ type: 'START_ANALYSIS', source: 'document', initialPhase: 'document-analysis' });
            setMode('document');

            const documentNames = documents.map((d) => d.name).join('、');
            appendMessage({
                id: generateUUID(),
                role: 'user',
                content: `分析以下文档：${documentNames}`
            });

            const progressMessageId = generateUUID();
            appendMessage({
                id: progressMessageId,
                role: 'assistant',
                content: {
                    type: 'document-analysis-progress',
                    logs: [],
                    currentPhase: 'document-analysis'
                }
            });

            let draftMessageId: string | null = null;
            let accumulatedDraft = '';
            let documentAnalyses: string[] = [];
            const runningLogs: PipelineProgressLog[] = [];

            try {
                const response = await fetch('/api/local-aibot/document-analysis', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        documents: documents.map((doc) => ({
                            id: doc.id,
                            name: doc.name,
                            content: doc.content
                        }))
                    }),
                    signal
                });

                if (!response.ok || !response.body) {
                    throw new Error('文档分析失败');
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));

                                if (data.type === 'progress') {
                                    const logEntry: PipelineProgressLog = {
                                        id: `${data.phase}-${Date.now()}`,
                                        timestamp: new Date().toLocaleTimeString('zh-CN'),
                                        phase: data.phase,
                                        status: data.status,
                                        message: data.message,
                                        details: data.details
                                    };
                                    runningLogs.push(logEntry);
                                    dispatch({
                                        type: 'APPEND_LOG',
                                        log: logEntry,
                                        currentPhase: data.phase
                                    });

                                    updateMessageContent(progressMessageId, {
                                        type: 'document-analysis-progress',
                                        logs: runningLogs,
                                        currentPhase: data.phase
                                    });
                                } else if (data.type === 'draft-start') {
                                    documentAnalyses = data.documentAnalyses || [];
                                    draftMessageId = generateUUID();

                                    appendMessage({
                                        id: draftMessageId,
                                        role: 'assistant',
                                        content: {
                                            type: 'document-analysis-draft',
                                            draftMarkdown: '',
                                            isStreaming: true,
                                            isComplete: false,
                                            documentAnalyses,
                                            userInput: documentNames
                                        }
                                    });
                                } else if (data.type === 'draft-chunk') {
                                    accumulatedDraft += data.content;
                                    if (draftMessageId) {
                                        updateMessageContent(draftMessageId, {
                                            type: 'document-analysis-draft',
                                            draftMarkdown: accumulatedDraft,
                                            isStreaming: true,
                                            isComplete: false,
                                            documentAnalyses,
                                            userInput: documentNames
                                        });
                                    }
                                } else if (data.type === 'draft-complete') {
                                    const finalDraft = data.draftMarkdown || accumulatedDraft;
                                    if (draftMessageId) {
                                        updateMessageContent(draftMessageId, {
                                            type: 'document-analysis-draft',
                                            draftMarkdown: finalDraft,
                                            isStreaming: false,
                                            isComplete: true,
                                            documentAnalyses,
                                            userInput: documentNames
                                        });
                                    }
                                    dispatch({
                                        type: 'SET_DRAFT',
                                        source: 'document',
                                        userInput: documentNames,
                                        draftMarkdown: finalDraft,
                                        metadata: {
                                            documents: documentAnalyses
                                        }
                                    });
                                }
                            } catch {
                                // 忽略坏帧
                            }
                        }
                    }
                }
            } catch (err: unknown) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                const errorMsg = err instanceof Error ? err.message : '文档分析失败';
                dispatch({ type: 'SET_ERROR', source: 'document', error: errorMsg });
            }
        },
        [appendMessage, getNewSignal, setMode, updateMessageContent]
    );

    // ========== 4. 确认草稿并检索图书 ==========
    const confirmDraft = useCallback(
        async (customDraft?: string) => {
            if (state.status !== 'draft-review') return;
            const signal = getNewSignal();
            const draftMarkdown = customDraft ?? state.draftMarkdown;
            const { source, userInput } = state;

            dispatch({
                type: 'START_BOOK_SEARCH',
                source,
                userInput,
                draftMarkdown
            });

            try {
                const response = await fetch('/api/local-aibot/deep-search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ draftMarkdown, userInput }),
                    signal
                });

                if (!response.ok) {
                    throw new Error('图书检索失败');
                }

                const data = await response.json();
                const books: BookInfo[] = data.retrievalResult?.books || [];

                const messageType =
                    source === 'document' ? 'document-analysis-books' : 'deep-search-books';
                appendMessage({
                    id: generateUUID(),
                    role: 'assistant',
                    content: {
                        type: messageType,
                        books,
                        draftMarkdown,
                        userInput
                    }
                });

                dispatch({
                    type: 'SET_BOOKS',
                    source,
                    userInput,
                    draftMarkdown,
                    books
                });
            } catch (err: unknown) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                const errorMsg = err instanceof Error ? err.message : '图书检索异常';
                dispatch({ type: 'SET_ERROR', source, error: errorMsg });
            }
        },
        [appendMessage, getNewSignal, state]
    );

    // ========== 5. 选书与状态切换 ==========
    const selectBook = useCallback((bookId: string, isSelected?: boolean) => {
        dispatch({ type: 'TOGGLE_BOOK_SELECTION', bookId, isSelected });
    }, []);

    const selectBooksBatch = useCallback((selectedBookIds: Set<string>) => {
        dispatch({ type: 'SET_SELECTED_BOOK_IDS', selectedBookIds });
    }, []);

    // ========== 6. 生成深度解读报告 ==========
    const generateInterpretation = useCallback(
        async (selectedBooks: BookInfo[], customDraftOrQuery?: string) => {
            const source: PipelineSource =
                'source' in state ? (state.source as PipelineSource) : 'deep';
            const draftMarkdown =
                customDraftOrQuery ||
                ('draftMarkdown' in state ? (state.draftMarkdown as string) : '');
            const userInput =
                'userInput' in state ? (state.userInput as string) : '';

            const signal = getNewSignal();
            dispatch({
                type: 'START_INTERPRETING',
                source,
                selectedBooks
            });

            const reportMessageId = generateUUID();
            const reportMessageType =
                source === 'document' ? 'document-analysis-report' : 'deep-search-report';

            appendMessage({
                id: reportMessageId,
                role: 'assistant',
                content: {
                    type: reportMessageType,
                    reportMarkdown: '',
                    isStreaming: true,
                    isComplete: false,
                    selectedBooks
                }
            });

            try {
                const endpoint =
                    source === 'simple'
                        ? '/api/local-aibot/generate-interpretation'
                        : '/api/local-aibot/deep-interpretation';

                const bodyPayload =
                    source === 'simple'
                        ? {
                              originalQuery: userInput || customDraftOrQuery,
                              selectedBooks
                          }
                        : {
                              selectedBooks,
                              draftMarkdown,
                              originalQuery: userInput
                          };

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyPayload),
                    signal
                });

                if (!response.ok || !response.body) {
                    throw new Error('深度解读生成失败');
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let accumulatedReport = '';

                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    accumulatedReport += chunk;

                    dispatch({ type: 'APPEND_REPORT_CHUNK', chunk });

                    updateMessageContent(reportMessageId, {
                        type: reportMessageType,
                        reportMarkdown: accumulatedReport,
                        isStreaming: true,
                        isComplete: false,
                        selectedBooks
                    });
                }

                updateMessageContent(reportMessageId, {
                    type: reportMessageType,
                    reportMarkdown: accumulatedReport,
                    isStreaming: false,
                    isComplete: true,
                    selectedBooks
                });

                dispatch({
                    type: 'COMPLETE',
                    source,
                    selectedBooks,
                    reportMarkdown: accumulatedReport
                });
            } catch (err: unknown) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                const errorMsg = err instanceof Error ? err.message : '解读生成异常';
                dispatch({ type: 'SET_ERROR', source, error: errorMsg });
            }
        },
        [appendMessage, getNewSignal, state, updateMessageContent]
    );

    // ========== 7. 二次检索 ==========
    const secondaryRetrieval = useCallback(
        async (selectedBooks: BookInfo[], query: string) => {
            const combinedQuery = `${query} ${selectedBooks.map((b) => b.title).join(' ')}`.trim();
            await startSimpleSearch(combinedQuery);
        },
        [startSimpleSearch]
    );

    const retry = useCallback(() => {
        dispatch({ type: 'RETRY' });
    }, []);

    return {
        state,
        startSimpleSearch,
        startDeepSearch,
        startDocumentAnalysis,
        confirmDraft,
        selectBook,
        selectBooksBatch,
        generateInterpretation,
        secondaryRetrieval,
        cancelOngoing,
        reset,
        retry
    };
}
