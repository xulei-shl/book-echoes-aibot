'use client';

import React, { useState, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import MessageStream from '@/components/aibot/MessageStream';
import AIBotHeader from '@/components/aibot/panels/AIBotHeader';
import AIBotInputBar from '@/components/aibot/panels/AIBotInputBar';
import { useAIBotWorkflow } from '@/components/aibot/controllers/useAIBotWorkflow';
import { useDocumentUploadController } from '@/components/aibot/DocumentUploadWorkflow';
import { useAIBotStore } from '@/store/aibot/useAIBotStore';
import { AIBOT_MODES } from '@/src/core/aibot/constants';
import type { UploadedDocument, BookInfo } from '@/src/core/aibot/types';

const subscribeMounted = () => () => {};

export default function AIBotOverlay() {
    const isMounted = useSyncExternalStore(
        subscribeMounted,
        () => true,
        () => false
    );
    const [inputValue, setInputValue] = useState('');

    const {
        isOverlayOpen,
        toggleOverlay,
        mode,
        setMode,
        messages,
        setMessages,
        clearUploadedDocuments,
        setError,
        error
    } = useAIBotStore();

    const workflow = useAIBotWorkflow();

    // 关闭弹窗：物理中断全部进行中请求 + 状态重置
    const handleClose = useCallback(() => {
        workflow.reset();
        clearUploadedDocuments();
        toggleOverlay(false);
    }, [clearUploadedDocuments, toggleOverlay, workflow]);

    // 清空会话记录
    const handleClear = useCallback(async () => {
        workflow.reset();
        setMessages([]);
        setInputValue('');
        clearUploadedDocuments();
        setMode(AIBOT_MODES.TEXT);

        try {
            await fetch('/api/local-aibot/clear', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch {
            setError('清空历史记录失败，请稍后重试');
            setTimeout(() => setError(undefined), 2000);
        }
    }, [clearUploadedDocuments, setError, setMessages, setMode, workflow]);

    // 文档分析启动回调
    const handleDocumentAnalysisStart = useCallback(
        async (documents: UploadedDocument[]) => {
            setMode(AIBOT_MODES.DOCUMENT);
            await workflow.startDocumentAnalysis(documents);
        },
        [setMode, workflow]
    );

    const documentUploadController = useDocumentUploadController(handleDocumentAnalysisStart);

    // 提交输入
    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();

            // 若有就绪文档，优先启动文档分析
            const readyDocs = documentUploadController.uploadedDocuments.filter(
                (d) => d.status === 'ready'
            );
            if (readyDocs.length > 0 && documentUploadController.statusStats.uploading === 0) {
                await handleDocumentAnalysisStart(readyDocs);
                return;
            }

            const trimmed = inputValue.trim();
            if (!trimmed) return;

            setInputValue('');

            if (mode === AIBOT_MODES.DEEP) {
                await workflow.startDeepSearch(trimmed);
            } else {
                await workflow.startSimpleSearch(trimmed);
            }
        },
        [
            documentUploadController.statusStats.uploading,
            documentUploadController.uploadedDocuments,
            handleDocumentAnalysisStart,
            inputValue,
            mode,
            workflow
        ]
    );

    // 导出对话与报告
    const handleDownload = useCallback(() => {
        let downloadContent = `# AIBot 对话记录\n\n生成时间：${new Date().toLocaleString('zh-CN')}\n\n`;

        for (const msg of messages) {
            const roleName = msg.role === 'user' ? '用户' : 'AIBot 助手';
            const content = (msg as { content?: unknown }).content;

            if (typeof content === 'string') {
                downloadContent += `## ${roleName}\n\n${content}\n\n`;
            } else if (content && typeof content === 'object') {
                const record = content as Record<string, unknown>;
                if (record.userInput) {
                    downloadContent += `> 主题/文档：${record.userInput}\n\n`;
                }
                if (typeof record.draftMarkdown === 'string') {
                    downloadContent += `### 研究草稿\n\n${record.draftMarkdown}\n\n`;
                }
                if (typeof record.reportMarkdown === 'string') {
                    downloadContent += `### 深度解读报告\n\n${record.reportMarkdown}\n\n`;
                }
            }
        }

        const blob = new Blob([downloadContent], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        link.href = url;
        link.download = `aibot-report-${timestamp}.md`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [messages]);

    const isBusy =
        workflow.state.status === 'analyzing' ||
        workflow.state.status === 'searching-books' ||
        workflow.state.status === 'interpreting';

    const busyLabel =
        workflow.state.status === 'analyzing'
            ? '分析生成中...'
            : workflow.state.status === 'searching-books'
              ? '检索图书中...'
              : workflow.state.status === 'interpreting'
                ? '生成解读中...'
                : undefined;

    if (!isMounted) return null;

    return createPortal(
        <AnimatePresence>
            {isOverlayOpen && (
                <motion.div
                    key="aibot-overlay-container"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0"
                    style={{ zIndex: 9999 }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) handleClose();
                    }}
                >
                    <motion.div
                        key="aibot-backdrop"
                        className="absolute inset-0 bg-[#000000]/90 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    />
                    <motion.div
                        key="aibot-dialog"
                        className="fixed inset-x-4 md:inset-x-20 lg:inset-x-32 top-12 bottom-12 bg-[#1a1a1a]/90 backdrop-blur-xl border border-[#C9A063]/30 overflow-hidden z-[10000] pointer-events-auto flex flex-col"
                        style={{ minHeight: 0 }}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* 装饰边角 */}
                        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#C9A063] z-20 pointer-events-none" />
                        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#C9A063] z-20 pointer-events-none" />
                        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#C9A063] z-20 pointer-events-none" />
                        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#C9A063] z-20 pointer-events-none" />

                        {/* 水印 */}
                        <div className="absolute -bottom-24 -right-12 pointer-events-none select-none opacity-[0.03] z-0">
                            <span className="font-display text-[16rem] leading-none text-[#C9A063] block transform -rotate-12">
                                书海回响
                            </span>
                        </div>

                        {/* 顶栏 */}
                        <AIBotHeader onClose={handleClose} />

                        {/* 消息主体 */}
                        <div className="relative flex-1 overflow-hidden z-10 flex flex-col" style={{ minHeight: '0' }}>
                            <div className="relative flex-1 overflow-hidden">
                                <div
                                    className="h-full flex flex-col gap-6 px-6 md:px-10 py-8 overflow-y-auto about-overlay-scroll"
                                    style={{ minHeight: '0' }}
                                >
                                    <div className="flex-1 min-h-0" style={{ overflow: 'hidden' }}>
                                        <MessageStream
                                            messages={messages}
                                            isStreaming={isBusy}
                                            onDeepSearchDraftConfirm={() => workflow.confirmDraft()}
                                            onDeepSearchDraftChange={(draft) => workflow.confirmDraft(draft)}
                                            onDocumentAnalysisDraftConfirm={() => workflow.confirmDraft()}
                                            onDocumentAnalysisDraftChange={(draft) => workflow.confirmDraft(draft)}
                                            onDeepSearchGenerateInterpretation={(books, draft) =>
                                                workflow.generateInterpretation(books, draft)
                                            }
                                            onDocumentAnalysisGenerateInterpretation={(books, draft) =>
                                                workflow.generateInterpretation(books, draft)
                                            }
                                            onSecondaryRetrieval={(books, query) =>
                                                workflow.secondaryRetrieval(books, query)
                                            }
                                            onGenerateInterpretation={(selectedBookIds) => {
                                                const selectedBooks = messages
                                                    .flatMap((m) => {
                                                        const c = (m as { content?: unknown }).content;
                                                        if (c && typeof c === 'object' && 'books' in c) {
                                                            return (c as { books: unknown[] }).books;
                                                        }
                                                        return [];
                                                    })
                                                    .filter(
                                                        (b) =>
                                                            b &&
                                                            typeof b === 'object' &&
                                                            'id' in b &&
                                                            selectedBookIds.has((b as { id: string }).id)
                                                    ) as unknown as BookInfo[];
                                                workflow.generateInterpretation(selectedBooks);
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#1a1a1a] to-transparent pointer-events-none z-10" />

                            {/* 统一输入栏 */}
                            <AIBotInputBar
                                inputValue={inputValue}
                                onInputChange={setInputValue}
                                onSubmit={handleSubmit}
                                mode={mode}
                                onModeToggle={() =>
                                    setMode(mode === AIBOT_MODES.DEEP ? AIBOT_MODES.TEXT : AIBOT_MODES.DEEP)
                                }
                                onClear={handleClear}
                                onDownload={handleDownload}
                                disabled={isBusy}
                                isBusy={isBusy}
                                busyLabel={busyLabel}
                                documentUploadController={documentUploadController}
                            />

                            {error && (
                                <p className="px-6 md:px-10 py-3 border-t border-[#C9A063]/10 text-xs text-[#C76B6B] bg-[#1a1a1a] relative z-10">
                                    {error}
                                </p>
                            )}

                            {/* 底部信息栏 */}
                            <div className="px-6 md:px-10 py-3 border-t border-[#C9A063]/20 flex justify-between items-center bg-[#1a1a1a] relative z-10">
                                <span className="font-mono text-[10px] text-[#C9A063]/40 tracking-widest">
                                    BOOK ECHOES SHANGHAI LIBRARY
                                </span>
                                <div className="flex gap-2">
                                    <div className="w-1 h-1 bg-[#C9A063]/40 rounded-full animate-pulse" />
                                    <div className="w-1 h-1 bg-[#C9A063]/40 rounded-full" />
                                    <div className="w-1 h-1 bg-[#C9A063]/40 rounded-full" />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
