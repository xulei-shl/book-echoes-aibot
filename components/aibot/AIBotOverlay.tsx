'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import MessageStream from '@/components/aibot/MessageStream';
import DocumentUploadButton from '@/components/aibot/DocumentUploadButton';
import DocumentUploadWorkflow, { useDocumentUploadController, MAX_DOCUMENTS } from '@/components/aibot/DocumentUploadWorkflow';
import DocumentAnalysisProgressMessage from '@/components/aibot/DocumentAnalysisProgressMessage';
import DocumentAnalysisDraftMessage from '@/components/aibot/DocumentAnalysisDraftMessage';
import { useAIBotStore } from '@/store/aibot/useAIBotStore';
import type { UIMessage } from 'ai';
import type {
    BookInfo,
    DeepSearchLogEntry,
    KeywordResult,
    DuckDuckGoSnippet,
    UploadedDocument,
    DocumentAnalysisMessageContent,
    DocumentAnalysisPhase,
    DocumentAnalysisLogEntry
} from '@/src/core/aibot/types';
import { AIBOT_MODES, type AIBotMode } from '@/src/core/aibot/constants';
import type { LogEntry, SearchPhase } from '@/components/aibot/ProgressLogDisplay';
import { formatBooksForSecondarySearch } from '@/src/utils/format-book-for-search';

const buildRequestMessages = (messages: UIMessage[]) =>
    messages.map((message) => ({
        role: message.role,
        content: typeof (message as any).content === 'string' ? (message as any).content : ''
    }));

export default function AIBotOverlay() {
    const {
        isOverlayOpen,
        toggleOverlay,
        mode,
        setMode,
        isDeepMode,
        setDeepMode,
        messages,
        setMessages,
        appendMessage,
        updateLastAssistantMessage,
        updateMessageContent,
        isStreaming,
        setStreaming,
        setPendingDraft,
        error,
        setError,
        setRetrievalResult,

        // 简单检索状态
        retrievalPhase,
        currentRetrievalResult,
        selectedBookIds,
        originalQuery,
        isGeneratingInterpretation,
        setRetrievalPhase,
        setCurrentRetrievalResult,
        setOriginalQuery,
        setIsGeneratingInterpretation,
        addSelectedBook,
        removeSelectedBook,
        clearSelection,

        // 深度检索对话式状态
        deepSearchPhase,
        deepSearchDraftMessageId,
        deepSearchDraftContent,
        isDeepSearchDraftStreaming,
        isDeepSearchDraftComplete,
        deepSearchSnippets,
        deepSearchKeywords,
        deepSearchUserInput,
        setDeepSearchPhase,
        setDeepSearchDraftMessageId,
        appendDeepSearchDraftContent,
        setDeepSearchDraftContent,
        setDeepSearchDraftStreaming,
        setDeepSearchDraftComplete,
        setDeepSearchSnippets,
        setDeepSearchKeywords,
        setDeepSearchBooksMessageId,
        setDeepSearchBooks,
        setDeepSearchSelectedBooks,
        setDeepSearchUserInput,
        addDeepSearchLog,
        clearDeepSearchLogs,
        deepSearchLogs,
        setDeepSearchProgressMessageId,
        resetDeepSearch,

        // 文档上传相关状态
        uploadedDocuments,
        documentUploadPhase,
        documentUploadError,
        setDocumentUploadPhase,
        setDocumentUploadError,
        addUploadedDocument,
        removeUploadedDocument,
        setUploadedDocuments,
        clearUploadedDocuments,

        // 文档分析状态
        documentAnalysisPhase,
        documentAnalysisProgressMessageId,
        documentAnalysisLogs,
        documentAnalysisDraftMessageId,
        documentAnalysisDraftContent,
        isDocumentAnalysisDraftStreaming,
        isDocumentAnalysisDraftComplete,
        documentAnalysisBooksMessageId,
        documentAnalysisBooks,
        documentAnalysisSelectedBooks,
        documentAnalysisUserInput,
        setDocumentAnalysisPhase,
        setDocumentAnalysisProgressMessageId,
        addDocumentAnalysisLog,
        setDocumentAnalysisDraftMessageId,
        setDocumentAnalysisDraftContent,
        setDocumentAnalysisDraftStreaming,
        setDocumentAnalysisDraftComplete,
        setDocumentAnalysisBooksMessageId,
        setDocumentAnalysisBooks,
        setDocumentAnalysisSelectedBooks,
        setDocumentAnalysisUserInput,
        resetDocumentAnalysis,
    } = useAIBotStore();

    const [inputValue, setInputValue] = useState('');
    const [isMounted, setIsMounted] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const documentAnalysisLogsRef = useRef<DocumentAnalysisLogEntry[]>(documentAnalysisLogs);

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

    const pushDocumentAnalysisLog = useCallback((entry: DocumentAnalysisLogEntry, targetMessageId?: string) => {
        documentAnalysisLogsRef.current = [
            ...documentAnalysisLogsRef.current.filter(log => log.phase !== entry.phase),
            entry
        ];

        addDocumentAnalysisLog(entry);

        const messageId = targetMessageId ?? documentAnalysisProgressMessageId;
        if (messageId) {
            updateMessageContent(messageId, {
                type: 'document-analysis-progress',
                logs: documentAnalysisLogsRef.current,
                currentPhase: entry.phase
            } as any);
        }
    }, [addDocumentAnalysisLog, documentAnalysisProgressMessageId, updateMessageContent]);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        documentAnalysisLogsRef.current = documentAnalysisLogs;
    }, [documentAnalysisLogs]);

    const lastAssistant = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i -= 1) {
            const content = (messages[i] as any).content;
            if (messages[i].role === 'assistant' && typeof content === 'string') {
                return content;
            }
        }
        return '';
    }, [messages]);

    const closeOverlay = () => {
        console.log('[AIBotOverlay] 关闭对话框，重置所有状态', {
            currentMessages: messages.length,
            currentMode: mode,
            currentDeepMode: isDeepMode
        });
        toggleOverlay(false);
        setInputValue('');
        setMessages([]);
        setPendingDraft(null, undefined);
        setError(undefined);
        resetDeepSearch();
        resetDocumentAnalysis();
        clearUploadedDocuments();
        setMode(AIBOT_MODES.TEXT); // 重置到简单模式
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

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmed = inputValue.trim();

        console.log('[AIBotOverlay] handleSubmit', {
            trimmed,
            mode,
            isDeepMode,
            deepSearchPhase,
            currentMessagesCount: messages.length,
            currentMessages: messages.map(msg => ({ role: msg.role })),
            currentRetrievalPhase: retrievalPhase
        });

        // 在文档模式下，不允许通过表单提交
        if (mode === AIBOT_MODES.DOCUMENT) {
            setError('文档分析模式下请使用上传功能');
            return;
        }

        if (!trimmed) {
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

        // 处理深度模式
        if (isDeepMode) {
            // 如果草稿已完成且正在确认阶段，执行图书检索
            if (deepSearchPhase === 'draft-confirm' && isDeepSearchDraftComplete) {
                await performDeepSearchBookRetrieval();
                return;
            }

            // 如果没有进行中的深度检索，开始新的深度检索流程
            if (deepSearchPhase === 'idle') {
                await executeDeepSearchAnalysis(trimmed);
                return;
            }

            // 其他情况暂不处理
            return;
        }

        // 普通模式下，并行执行分类和简单检索
        await performSimpleSearchWithClassification(trimmed);
    };

    // 执行文档分析（流式）
    const executeDocumentAnalysis = async (documents: UploadedDocument[]) => {
        // 重置文档分析状态
        resetDocumentAnalysis();
        documentAnalysisLogsRef.current = [];
        setDocumentAnalysisPhase('progress');

        // 添加进度消息
        const progressMessageId = crypto.randomUUID();
        const progressMessage: UIMessage = {
            id: progressMessageId,
            role: 'assistant',
            content: {
                type: 'document-analysis-progress',
                logs: [],
                currentPhase: ''
            }
        } as any;
        appendMessage(progressMessage);
        setDocumentAnalysisProgressMessageId(progressMessageId);

        try {
            const documentNames = documents.map(doc => doc.name).join(', ');
            const defaultUserInput = `文档分析：${documentNames}`;
            setDocumentAnalysisUserInput(defaultUserInput);
            let analysisUserInput = defaultUserInput;
            console.log('[AIBotOverlay] 开始文档分析', {
                documentCount: documents.length,
                documentNames
            });

            const response = await fetch('/api/local-aibot/document-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    documents: documents.map(doc => ({
                        id: doc.id,
                        name: doc.name,
                        content: doc.content
                    }))
                })
            });

            if (!response.ok) {
                throw new Error('文档分析失败');
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                throw new Error('无法读取响应流');
            }

            let buffer = '';

            // 添加草稿消息（用于流式显示）
            const draftMessageId = crypto.randomUUID();
            let draftMessageAdded = false;

            // 本地变量累积草稿内容
            let accumulatedDraft = '';
            // 本地变量保存文档分析结果
            let documentAnalyses: string[] = [];

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
                                const logEntry: DocumentAnalysisLogEntry = {
                                    id: `${data.phase}-${Date.now()}`,
                                    timestamp: new Date().toLocaleTimeString('zh-CN'),
                                    phase: data.phase,
                                    status: data.status,
                                    message: data.message,
                                    details: data.details
                                };
                                pushDocumentAnalysisLog(logEntry, progressMessageId);
                            } else if (data.type === 'draft-start') {
                                // 草稿开始，保存文档分析结果
                                documentAnalyses = data.documentAnalyses || [];
                                if (typeof data.userInput === 'string' && data.userInput.trim()) {
                                    analysisUserInput = data.userInput;
                                    setDocumentAnalysisUserInput(data.userInput);
                                }

                                // 添加草稿消息
                                if (!draftMessageAdded) {
                                    const draftMessage: UIMessage = {
                                        id: draftMessageId,
                                        role: 'assistant',
                                        content: {
                                            type: 'document-analysis-draft',
                                            draftMarkdown: '',
                                            isStreaming: true,
                                            isComplete: false,
                                            documentAnalyses,
                                            userInput: analysisUserInput
                                        }
                                    } as any;
                                    appendMessage(draftMessage);
                                    setDocumentAnalysisDraftMessageId(draftMessageId);
                                    setDocumentAnalysisDraftStreaming(true);
                                    setDocumentAnalysisPhase('draft-streaming');
                                    draftMessageAdded = true;
                                }
                            } else if (data.type === 'draft-chunk') {
                                // 草稿内容块：使用本地变量累积
                                accumulatedDraft += data.content;
                                setDocumentAnalysisDraftContent(accumulatedDraft);

                                // 更新草稿消息内容（使用本地累积的内容）
                                updateMessageContent(draftMessageId, {
                                    type: 'document-analysis-draft',
                                    draftMarkdown: accumulatedDraft,
                                    isStreaming: true,
                                    isComplete: false,
                                    documentAnalyses,
                                    userInput: analysisUserInput
                                } as any);
                            } else if (data.type === 'draft-complete') {
                                // 草稿完成
                                setDocumentAnalysisDraftContent(data.draftMarkdown);
                                setDocumentAnalysisDraftStreaming(false);
                                setDocumentAnalysisDraftComplete(true);
                                setDocumentAnalysisPhase('draft-confirm');

                                // 更新草稿消息为完成状态
                                updateMessageContent(draftMessageId, {
                                    type: 'document-analysis-draft',
                                    draftMarkdown: data.draftMarkdown,
                                    isStreaming: false,
                                    isComplete: true,
                                    documentAnalyses,
                                    userInput: analysisUserInput
                                } as any);
                            }
                        } catch (parseError) {
                            console.error('解析SSE数据失败:', parseError);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('文档分析错误:', error);
            setError(error instanceof Error ? error.message : '文档分析失败');
            setDocumentAnalysisPhase('idle');
        }
    };

    // 执行深度检索分析（流式）
    const executeDeepSearchAnalysis = async (userInput: string) => {
        // 重置状态
        resetDeepSearch();
        clearDeepSearchLogs();
        setDeepSearchUserInput(userInput);
        setDeepSearchPhase('progress');

        // 添加进度消息
        const progressMessageId = crypto.randomUUID();
        const progressMessage: UIMessage = {
            id: progressMessageId,
            role: 'assistant',
            content: {
                type: 'deep-search-progress',
                logs: [],
                currentPhase: ''
            }
        } as any;
        appendMessage(progressMessage);
        setDeepSearchProgressMessageId(progressMessageId);

        try {
            const response = await fetch('/api/local-aibot/deep-search-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userInput })
            });

            if (!response.ok) {
                throw new Error('深度检索分析失败');
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                throw new Error('无法读取响应流');
            }

            let buffer = '';

            // 添加草稿消息（用于流式显示）
            const draftMessageId = crypto.randomUUID();
            let draftMessageAdded = false;

            // 本地变量累积草稿内容（避免闭包问题）
            let accumulatedDraft = '';
            // 本地变量保存元数据（避免闭包问题）
            let localKeywords: KeywordResult[] = [];
            let localSnippets: DuckDuckGoSnippet[] = [];

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
                                // 更新进度日志
                                const logEntry: DeepSearchLogEntry = {
                                    id: `${data.phase}-${Date.now()}`,
                                    timestamp: new Date().toLocaleTimeString('zh-CN'),
                                    phase: data.phase,
                                    status: data.status,
                                    message: data.message,
                                    details: data.details
                                };
                                addDeepSearchLog(logEntry);

                                // 获取当前的日志列表（在添加新日志后）
                                const getCurrentLogs = () => {
                                    // 直接获取当前状态中最新的日志
                                    return deepSearchLogs.map(log =>
                                        log.phase === data.phase ? logEntry : log
                                    );
                                };

                                // 确保日志中包含当前阶段
                                const updatedLogs = getCurrentLogs();
                                if (!updatedLogs.some(log => log.phase === data.phase)) {
                                    updatedLogs.push(logEntry);
                                }

                                // 更新进度消息内容
                                updateMessageContent(progressMessageId, {
                                    type: 'deep-search-progress',
                                    logs: updatedLogs,
                                    currentPhase: data.phase
                                } as any);
                            } else if (data.type === 'draft-start') {
                                // 草稿开始，保存元数据到本地变量和 store
                                localKeywords = data.keywords || [];
                                localSnippets = data.searchSnippets || [];
                                setDeepSearchKeywords(localKeywords);
                                setDeepSearchSnippets(localSnippets);

                                // 添加草稿消息
                                if (!draftMessageAdded) {
                                    const draftMessage: UIMessage = {
                                        id: draftMessageId,
                                        role: 'assistant',
                                        content: {
                                            type: 'deep-search-draft',
                                            draftMarkdown: '',
                                            isStreaming: true,
                                            isComplete: false,
                                            searchSnippets: localSnippets,
                                            keywords: localKeywords,
                                            userInput
                                        }
                                    } as any;
                                    appendMessage(draftMessage);
                                    setDeepSearchDraftMessageId(draftMessageId);
                                    setDeepSearchDraftStreaming(true);
                                    setDeepSearchPhase('draft-streaming');
                                    draftMessageAdded = true;
                                }
                            } else if (data.type === 'draft-chunk') {
                                // 草稿内容块：使用本地变量累积（复用简单检索的模式）
                                accumulatedDraft += data.content;
                                appendDeepSearchDraftContent(data.content);

                                // 更新草稿消息内容（使用本地累积的内容）
                                updateMessageContent(draftMessageId, {
                                    type: 'deep-search-draft',
                                    draftMarkdown: accumulatedDraft,
                                    isStreaming: true,
                                    isComplete: false,
                                    searchSnippets: localSnippets,
                                    keywords: localKeywords,
                                    userInput
                                } as any);
                            } else if (data.type === 'draft-complete') {
                                // 草稿完成
                                setDeepSearchDraftContent(data.draftMarkdown);
                                setDeepSearchDraftStreaming(false);
                                setDeepSearchDraftComplete(true);
                                setDeepSearchPhase('draft-confirm');

                                // 更新草稿消息为完成状态
                                updateMessageContent(draftMessageId, {
                                    type: 'deep-search-draft',
                                    draftMarkdown: data.draftMarkdown,
                                    isStreaming: false,
                                    isComplete: true,
                                    searchSnippets: localSnippets,
                                    keywords: localKeywords,
                                    userInput
                                } as any);
                            }
                        } catch (parseError) {
                            console.error('解析SSE数据失败:', parseError);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('深度检索分析错误:', error);
            setError(error instanceof Error ? error.message : '深度检索分析失败');
            setDeepSearchPhase('idle');
        }
    };

    // 执行深度检索图书检索
    const performDeepSearchBookRetrieval = async () => {
        setDeepSearchPhase('book-search');

        // 添加图书检索进度日志
        const bookSearchLog: DeepSearchLogEntry = {
            id: `book-search-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString('zh-CN'),
            phase: 'book-search',
            status: 'running',
            message: '正在检索相关图书...'
        };
        addDeepSearchLog(bookSearchLog);

        try {
            const response = await fetch('/api/local-aibot/deep-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    draftMarkdown: deepSearchDraftContent,
                    userInput: deepSearchUserInput
                })
            });

            if (!response.ok) {
                throw new Error('图书检索失败');
            }

            const data = await response.json();

            if (data.success) {
                const books = data.retrievalResult?.books || [];
                setDeepSearchBooks(books);

                // 更新图书检索进度日志为完成
                addDeepSearchLog({
                    id: `book-search-${Date.now()}`,
                    timestamp: new Date().toLocaleTimeString('zh-CN'),
                    phase: 'book-search',
                    status: 'completed',
                    message: `找到 ${books.length} 本相关图书`
                });

                // 添加图书列表消息
                const booksMessageId = crypto.randomUUID();
                const booksMessage: UIMessage = {
                    id: booksMessageId,
                    role: 'assistant',
                    content: {
                        type: 'deep-search-books',
                        books,
                        draftMarkdown: deepSearchDraftContent,
                        userInput: deepSearchUserInput
                    }
                } as any;
                appendMessage(booksMessage);
                setDeepSearchBooksMessageId(booksMessageId);
                setDeepSearchPhase('book-selection');
            } else {
                throw new Error(data.message || '图书检索失败');
            }
        } catch (error) {
            console.error('图书检索错误:', error);
            setError(error instanceof Error ? error.message : '图书检索失败');
            setDeepSearchPhase('draft-confirm');
        }
    };

    // 深度检索：草稿内容变更
    const handleDeepSearchDraftChange = useCallback((value: string) => {
        setDeepSearchDraftContent(value);
        // 同步更新消息内容
        if (deepSearchDraftMessageId) {
            updateMessageContent(deepSearchDraftMessageId, {
                type: 'deep-search-draft',
                draftMarkdown: value,
                isStreaming: false,
                isComplete: true,
                searchSnippets: deepSearchSnippets,
                keywords: deepSearchKeywords,
                userInput: deepSearchUserInput
            } as any);
        }
    }, [deepSearchDraftMessageId, deepSearchSnippets, deepSearchKeywords, deepSearchUserInput, setDeepSearchDraftContent, updateMessageContent]);

    // 深度检索：确认草稿
    const handleDeepSearchDraftConfirm = useCallback(async () => {
        await performDeepSearchBookRetrieval();
    }, [deepSearchDraftContent, deepSearchUserInput]);

    // 深度检索：重新生成
    const handleDeepSearchDraftRegenerate = useCallback(() => {
        resetDeepSearch();
        // 重新开始深度检索
        if (deepSearchUserInput) {
            executeDeepSearchAnalysis(deepSearchUserInput);
        }
    }, [deepSearchUserInput, resetDeepSearch]);

    // 深度检索：取消
    const handleDeepSearchDraftCancel = useCallback(() => {
        resetDeepSearch();
    }, [resetDeepSearch]);

    // 深度检索：生成解读
    const handleDeepSearchGenerateInterpretation = useCallback(async (selectedBooks: BookInfo[], draftMarkdown: string) => {
        setDeepSearchSelectedBooks(selectedBooks);
        setDeepSearchPhase('report-streaming');

        // 添加报告生成进度日志
        addDeepSearchLog({
            id: `report-generation-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString('zh-CN'),
            phase: 'report-generation',
            status: 'running',
            message: '正在生成解读报告...'
        });

        // 添加解读消息 - 使用简单检索的方式（字符串内容）
        const reportMessage: UIMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: ''  // 使用空字符串初始化，后续用 updateLastAssistantMessage 更新
        } as any;
        appendMessage(reportMessage);

        try {
            const response = await fetch('/api/local-aibot/deep-interpretation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    selectedBooks,
                    draftMarkdown,
                    originalQuery: deepSearchUserInput
                })
            });

            if (!response.ok || !response.body) {
                throw new Error('深度解读生成失败');
            }

            // 流式读取解读内容（使用简单检索的方式）
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                updateLastAssistantMessage(buffer);
            }

            // 更新报告生成进度日志为完成
            addDeepSearchLog({
                id: `report-generation-${Date.now()}`,
                timestamp: new Date().toLocaleTimeString('zh-CN'),
                phase: 'report-generation',
                status: 'completed',
                message: '解读报告生成完成'
            });

            setDeepSearchPhase('completed');
        } catch (error) {
            console.error('深度解读生成错误:', error);
            setError(error instanceof Error ? error.message : '深度解读生成失败');
            setDeepSearchPhase('book-selection');
        }
    }, [deepSearchUserInput, appendMessage, updateMessageContent, setDeepSearchSelectedBooks, setDeepSearchPhase, setError]);

    // ========== 文档分析相关回调函数 ==========

    // 文档上传工作流：开始分析
    const handleDocumentAnalysisStart = useCallback(async (documents: UploadedDocument[]) => {
        // 切换到文档上传模式
        setMode('document');

        // 添加用户消息显示正在分析的文档
        const documentNames = documents.map(doc => doc.name).join(', ');
        const userMessage: UIMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: `分析以下文档：${documentNames}`
        } as any;

        appendMessage(userMessage);

        // 开始文档分析
        await executeDocumentAnalysis(documents);
    }, [setMode, appendMessage, executeDocumentAnalysis]);

    const documentUploadController = useDocumentUploadController(handleDocumentAnalysisStart);

    // 文档分析：草稿内容变更
    const handleDocumentAnalysisDraftChange = useCallback((value: string) => {
        setDocumentAnalysisDraftContent(value);
        // 同步更新消息内容
        if (documentAnalysisDraftMessageId) {
            updateMessageContent(documentAnalysisDraftMessageId, {
                type: 'document-analysis-draft',
                draftMarkdown: value,
                isStreaming: false,
                isComplete: true,
                documentAnalyses: [], // 这些值在实际使用中应该从状态获取
                userInput: documentAnalysisUserInput
            } as any);
        }
    }, [documentAnalysisDraftMessageId, documentAnalysisUserInput, setDocumentAnalysisDraftContent, updateMessageContent]);

    // 文档分析：确认草稿
    const handleDocumentAnalysisDraftConfirm = useCallback(async () => {
        // 复用深度检索的图书检索逻辑
        // 将文档分析的草稿作为查询内容
        if (documentAnalysisDraftContent) {
            // 复用深度检索的图书检索流程
            setDocumentAnalysisPhase('book-search');
            pushDocumentAnalysisLog({
                id: `book-search-${Date.now()}`,
                timestamp: new Date().toLocaleTimeString('zh-CN'),
                phase: 'book-search',
                status: 'running',
                message: '正在检索相关图书...'
            }, documentAnalysisProgressMessageId || undefined);

            try {
                const response = await fetch('/api/local-aibot/document-analysis/book-search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        draftMarkdown: documentAnalysisDraftContent,
                        userInput: documentAnalysisUserInput
                    })
                });

                if (!response.ok) {
                    throw new Error('文档分析图书检索失败');
                }

                const data = await response.json();

                if (data.success) {
                    const books = data.retrievalResult?.books || [];
                    setDocumentAnalysisBooks(books);
                    pushDocumentAnalysisLog({
                        id: `book-search-${Date.now()}`,
                        timestamp: new Date().toLocaleTimeString('zh-CN'),
                        phase: 'book-search',
                        status: 'completed',
                        message: `找到 ${books.length} 本相关图书`
                    }, documentAnalysisProgressMessageId || undefined);

                    // 添加图书列表消息
                    const booksMessageId = crypto.randomUUID();
                    const booksMessage: UIMessage = {
                        id: booksMessageId,
                        role: 'assistant',
                        content: {
                            type: 'document-analysis-books',
                            books,
                            draftMarkdown: documentAnalysisDraftContent,
                            userInput: documentAnalysisUserInput
                        }
                    } as any;
                    appendMessage(booksMessage);
                    setDocumentAnalysisBooksMessageId(booksMessageId);
                    setDocumentAnalysisPhase('book-selection');
                } else {
                    throw new Error(data.message || '图书检索失败');
                }
            } catch (error) {
                console.error('图书检索错误:', error);
                pushDocumentAnalysisLog({
                    id: `book-search-${Date.now()}`,
                    timestamp: new Date().toLocaleTimeString('zh-CN'),
                    phase: 'book-search',
                    status: 'error',
                    message: error instanceof Error ? error.message : '图书检索失败'
                }, documentAnalysisProgressMessageId || undefined);
                setError(error instanceof Error ? error.message : '图书检索失败');
                setDocumentAnalysisPhase('draft-confirm');
            }
        }
    }, [appendMessage, documentAnalysisDraftContent, documentAnalysisProgressMessageId, documentAnalysisUserInput, pushDocumentAnalysisLog, setDocumentAnalysisBooks, setDocumentAnalysisBooksMessageId, setDocumentAnalysisPhase, setError]);

    // 文档分析：重新生成
    const handleDocumentAnalysisDraftRegenerate = useCallback(() => {
        resetDocumentAnalysis();
        // 重新开始文档分析
        const readyDocuments = uploadedDocuments.filter(doc => doc.status === 'ready');
        if (readyDocuments.length > 0) {
            executeDocumentAnalysis(readyDocuments);
        }
    }, [uploadedDocuments, resetDocumentAnalysis, executeDocumentAnalysis]);

    // 文档分析：取消
    const handleDocumentAnalysisDraftCancel = useCallback(() => {
        resetDocumentAnalysis();
        setMode(AIBOT_MODES.TEXT); // 回到简单模式
    }, [resetDocumentAnalysis, setMode]);

    // 文档分析：生成解读
    const handleDocumentAnalysisGenerateInterpretation = useCallback(async (selectedBooks: BookInfo[], draftMarkdown: string) => {
        setDocumentAnalysisSelectedBooks(selectedBooks);
        setDocumentAnalysisPhase('report-streaming');
        pushDocumentAnalysisLog({
            id: `report-generation-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString('zh-CN'),
            phase: 'report-generation',
            status: 'running',
            message: '正在生成解读报告...'
        }, documentAnalysisProgressMessageId || undefined);

        // 添加解读消息
        const reportMessage: UIMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: ''  // 使用空字符串初始化，后续用 updateLastAssistantMessage 更新
        } as any;
        appendMessage(reportMessage);

        try {
            const response = await fetch('/api/local-aibot/deep-interpretation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    selectedBooks,
                    draftMarkdown,
                    originalQuery: documentAnalysisUserInput
                })
            });

            if (!response.ok || !response.body) {
                throw new Error('文档解读生成失败');
            }

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

            setDocumentAnalysisPhase('completed');
            pushDocumentAnalysisLog({
                id: `report-generation-${Date.now()}`,
                timestamp: new Date().toLocaleTimeString('zh-CN'),
                phase: 'report-generation',
                status: 'completed',
                message: '解读报告生成完成'
            }, documentAnalysisProgressMessageId || undefined);
        } catch (error) {
            console.error('文档解读生成错误:', error);
            pushDocumentAnalysisLog({
                id: `report-generation-${Date.now()}`,
                timestamp: new Date().toLocaleTimeString('zh-CN'),
                phase: 'report-generation',
                status: 'error',
                message: error instanceof Error ? error.message : '文档解读生成失败'
            }, documentAnalysisProgressMessageId || undefined);
            setError(error instanceof Error ? error.message : '文档解读生成失败');
            setDocumentAnalysisPhase('book-selection');
        }
    }, [appendMessage, documentAnalysisProgressMessageId, documentAnalysisUserInput, pushDocumentAnalysisLog, setDocumentAnalysisPhase, setDocumentAnalysisSelectedBooks, setError, updateLastAssistantMessage]);

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

    // 新增：处理二次检索
    const handleSecondaryRetrieval = useCallback((selectedBooks: BookInfo[], query: string) => {
        // 格式化图书信息并填充输入框
        const formattedText = formatBooksForSecondarySearch(selectedBooks, query);
        setInputValue(formattedText);

        // 清空选择状态，回到检索模式
        clearSelection();
        setRetrievalPhase('search');

        // 如果当前是深度检索模式，切换到简单检索模式
        if (isDeepMode) {
            setDeepMode(false);
        }

        console.log('[AIBotOverlay] 二次检索：切换到简单检索模式，填充输入框', {
            selectedBooksCount: selectedBooks.length,
            isDeepMode,
            formattedTextLength: formattedText.length
        });
    }, [clearSelection, setRetrievalPhase, isDeepMode, setDeepMode]);


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
        setPendingDraft(null, undefined);
        setError(undefined);
        resetDeepSearch(); // 重置深度检索状态
        resetDocumentAnalysis(); // 重置文档分析状态
        clearUploadedDocuments(); // 清空已上传文档
        setMode(AIBOT_MODES.TEXT); // 回到简单模式，恢复上传能力
        
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
                        <div>
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
                                        isStreaming={isStreaming || isGeneratingInterpretation || isDeepSearchDraftStreaming || isDocumentAnalysisDraftStreaming}
                                        isSearching={isSearching}
                                        retrievalPhase={retrievalPhase}
                                        selectedBookIds={selectedBookIds}
                                        onBookSelection={handleBookSelection}
                                        onGenerateInterpretation={handleGenerateInterpretation}
                                        onReenterSelection={reenterSelection}
                                        onSecondaryRetrieval={handleSecondaryRetrieval}
                                        originalQuery={originalQuery}
                                        simpleSearchLogs={simpleSearchLogs}
                                        simpleSearchPhase={simpleSearchPhase}
                                        // 深度检索回调
                                        onDeepSearchDraftChange={handleDeepSearchDraftChange}
                                        onDeepSearchDraftConfirm={handleDeepSearchDraftConfirm}
                                        onDeepSearchDraftRegenerate={handleDeepSearchDraftRegenerate}
                                        onDeepSearchDraftCancel={handleDeepSearchDraftCancel}
                                        onDeepSearchGenerateInterpretation={handleDeepSearchGenerateInterpretation}
                                        // 文档分析回调
                                        onDocumentAnalysisDraftChange={handleDocumentAnalysisDraftChange}
                                        onDocumentAnalysisDraftConfirm={handleDocumentAnalysisDraftConfirm}
                                        onDocumentAnalysisDraftRegenerate={handleDocumentAnalysisDraftRegenerate}
                                        onDocumentAnalysisDraftCancel={handleDocumentAnalysisDraftCancel}
                                        onDocumentAnalysisGenerateInterpretation={handleDocumentAnalysisGenerateInterpretation}
                                    />
                                </div>
                            </div>
                        </div>

                        <form id="aibot-form" className="space-y-3 pt-4 border-t border-[#2E2E2E]" onSubmit={handleSubmit}>
                            {/* 文档上传工作流 */}
                            <div className="relative" style={{ minHeight: '150px' }}>
                                <textarea
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && e.ctrlKey) {
                                        e.preventDefault();
                                        // 创建一个模拟的表单事件
                                        const syntheticEvent = {
                                            preventDefault: () => {},
                                            currentTarget: e.currentTarget.form
                                        } as React.FormEvent<HTMLFormElement>;
                                        handleSubmit(syntheticEvent);
                                    }
                                }}
                                placeholder={
                                    mode === AIBOT_MODES.DEEP ? '输入检索主题，开始深度检索' :
                                    mode === AIBOT_MODES.DOCUMENT ? '文档分析模式中，请等待分析完成...' :
                                    '想了解什么图书？或点击左下角上传文档分析'
                                }
                                className="w-full h-24 bg-[#1B1B1B] border border-[#3A3A3A] rounded-2xl p-4 text-sm text-[#E8E6DC] focus:outline-none focus:border-[#C9A063] font-info-content about-overlay-scroll overflow-y-auto"
                                disabled={isStreaming || isGeneratingInterpretation || isSearching || isDeepSearchDraftStreaming || isDocumentAnalysisDraftStreaming || mode === AIBOT_MODES.DOCUMENT}
                            />

                            {/* 文档上传工作流组件 - 在简单模式和文档模式下显示 */}
                            {(mode === AIBOT_MODES.TEXT || mode === AIBOT_MODES.DOCUMENT) && (
                                <DocumentUploadWorkflow
                                    controller={documentUploadController}
                                    disabled={isStreaming || isGeneratingInterpretation || isSearching || isDeepSearchDraftStreaming || isDocumentAnalysisDraftStreaming}
                                    isAnalyzing={mode === AIBOT_MODES.DOCUMENT}
                                />
                            )}
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 text-xs text-[#7C7A74]">
                                    <DocumentUploadButton
                                        onFilesSelected={documentUploadController.handleFilesSelected}
                                        disabled={
                                            isStreaming ||
                                            isGeneratingInterpretation ||
                                            isSearching ||
                                            isDeepSearchDraftStreaming ||
                                            isDocumentAnalysisDraftStreaming ||
                                            mode === AIBOT_MODES.DOCUMENT
                                        }
                                        uploadedCount={documentUploadController.uploadedDocuments.length}
                                        maxFiles={MAX_DOCUMENTS}
                                    />
                                    <button
                                        type="button"
                                        className={clsx(
                                            'px-3 py-1 rounded-full border',
                                            mode === AIBOT_MODES.DEEP ? 'border-[#C9A063] text-[#C9A063]' : 'border-[#3A3A3A] text-[#A2A09A]'
                                        )}
                                        onClick={() => setMode(mode === AIBOT_MODES.DEEP ? AIBOT_MODES.TEXT : AIBOT_MODES.DEEP)}
                                    >
                                        {mode === AIBOT_MODES.DEEP ? '深度检索已开启' : '深度检索关闭'}
                                    </button>
                                    {/* 模式指示器 */}
                                    <div className="flex items-center gap-1 text-xs">
                                        <span className={clsx(
                                            'w-2 h-2 rounded-full',
                                            mode === AIBOT_MODES.TEXT ? 'bg-blue-500' : mode === AIBOT_MODES.DEEP ? 'bg-[#C9A063]' : 'bg-purple-500'
                                        )}></span>
                                        <span className={clsx(
                                            mode === AIBOT_MODES.TEXT ? 'text-blue-400' : mode === AIBOT_MODES.DEEP ? 'text-[#C9A063]' : 'text-purple-400'
                                        )}>
                                            {mode === AIBOT_MODES.TEXT ? '简单' : mode === AIBOT_MODES.DEEP ? '深度' : '文档'}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleClear}
                                        disabled={isStreaming}
                                        className="hover:text-white transition-colors disabled:cursor-not-allowed disabled:text-[#555]"
                                    >
                                        清空
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCopy}
                                        className="hover:text-white transition-colors"
                                    >
                                        复制
                                    </button>
                                </div>
                                <button
                                    type="submit"
                                    disabled={isStreaming || isSearching || isDeepSearchDraftStreaming || isDocumentAnalysisDraftStreaming || mode === AIBOT_MODES.DOCUMENT}
                                    className="px-4 py-2 rounded-full bg-[#C9A063] text-black text-sm disabled:opacity-50"
                                >
                                    {mode === AIBOT_MODES.DOCUMENT ? '文档分析模式' :
                                     isSearching ? '检索中...' :
                                     isDeepSearchDraftStreaming || isDocumentAnalysisDraftStreaming ? '生成草稿中...' :
                                     deepSearchPhase === 'draft-confirm' ? '确认检索' :
                                     deepSearchPhase !== 'idle' && deepSearchPhase !== 'completed' && isDeepMode ? '深度检索进行中...' :
                                     isDeepMode ? '开始深度检索' :
                                     '发送'}
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
