'use client';

import React, { useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import MessageStream from '@/components/aibot/MessageStream';
import AIBotHeader from '@/components/aibot/panels/AIBotHeader';
import AIBotInputBar from '@/components/aibot/panels/AIBotInputBar';
import AIBotPasswordGate from '@/components/aibot/AIBotPasswordGate';
import { useAIBotWorkflow } from '@/components/aibot/controllers/useAIBotWorkflow';
import { useDocumentUploadController } from '@/components/aibot/DocumentUploadWorkflow';
import { useAIBotStore } from '@/store/aibot/useAIBotStore';
import { AIBOT_MODES } from '@/src/core/aibot/constants';
import type { UploadedDocument } from '@/src/core/aibot/types';

const subscribeMounted = () => () => {};

type AIBotAccessState = 'checking' | 'locked' | 'unlocked';

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

    const [accessState, setAccessState] = useState<AIBotAccessState>('checking');

    // 打开弹窗时向服务端确认密码门状态；未配置密码时直接视为已解锁
    useEffect(() => {
        if (!isOverlayOpen) {
            setAccessState('checking');
            return;
        }

        let cancelled = false;
        setAccessState('checking');

        const loadAccessState = async () => {
            try {
                const response = await fetch('/api/local-aibot/auth', { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error(`访问验证状态查询失败：${response.status}`);
                }
                const data = (await response.json()) as {
                    required?: boolean;
                    authenticated?: boolean;
                };
                if (!cancelled) {
                    setAccessState(data.required && !data.authenticated ? 'locked' : 'unlocked');
                }
            } catch {
                if (!cancelled) {
                    setAccessState('locked');
                }
            }
        };

        void loadAccessState();

        return () => {
            cancelled = true;
        };
    }, [isOverlayOpen]);

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

            // 若有就绪文档且处于文档模式（或有就绪文档且输入为空），优先启动文档分析
            const readyDocs = documentUploadController.uploadedDocuments.filter(
                (d) => d.status === 'ready'
            );
            const trimmed = inputValue.trim();

            if (mode === AIBOT_MODES.DOCUMENT || (readyDocs.length > 0 && !trimmed)) {
                if (readyDocs.length > 0 && documentUploadController.statusStats.uploading === 0) {
                    await handleDocumentAnalysisStart(readyDocs);
                    return;
                }
            }

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

    // 当错误已经在消息流卡片中就地承载时（例如解读报告失败卡片），不在弹窗底部脱节展示
    const isReportErrorDisplayedInStream = messages.some((m) => {
        const c = (m as { content?: unknown }).content;
        return c && typeof c === 'object' && 'error' in c && Boolean((c as { error?: string }).error);
    });

    const workflowError =
        workflow.state.status === 'error' && !isReportErrorDisplayedInStream
            ? workflow.state.error
            : undefined;
    const displayedError = error ?? workflowError;

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
                        className="fixed inset-x-2 sm:inset-x-4 md:inset-x-12 lg:inset-x-24 xl:inset-x-36 top-2 sm:top-4 md:top-6 bottom-2 sm:bottom-4 md:bottom-6 bg-[#161514]/95 backdrop-blur-xl border border-[#C9A063]/30 overflow-hidden z-[10000] pointer-events-auto flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.85)]"
                        style={{ minHeight: 0 }}
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* 装饰边角 */}
                        <div className="absolute top-0 left-0 w-3.5 h-3.5 border-t-2 border-l-2 border-[#C9A063] z-20 pointer-events-none" />
                        <div className="absolute top-0 right-0 w-3.5 h-3.5 border-t-2 border-r-2 border-[#C9A063] z-20 pointer-events-none" />
                        <div className="absolute bottom-0 left-0 w-3.5 h-3.5 border-b-2 border-l-2 border-[#C9A063] z-20 pointer-events-none" />
                        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 border-b-2 border-r-2 border-[#C9A063] z-20 pointer-events-none" />

                        {/* 水印 */}
                        <div className="absolute -bottom-24 -right-12 pointer-events-none select-none opacity-[0.03] z-0">
                            <span className="font-display text-[16rem] leading-none text-[#C9A063] block transform -rotate-12">
                                书海回响
                            </span>
                        </div>

                        {/* 顶栏 (精简高度) */}
                        <AIBotHeader onClose={handleClose} />

                        {/* 消息主体 (扁平化单一滚动区，保留全部交互) */}
                        <div className="relative flex-1 min-h-0 z-10 flex flex-col overflow-hidden">
                            {accessState === 'unlocked' && (
                                <>
                                    <MessageStream
                                        messages={messages}
                                        isStreaming={isBusy}
                                        onDeepSearchDraftConfirm={() => workflow.confirmDraft()}
                                        onDeepSearchDraftChange={(draft) => workflow.confirmDraft(draft)}
                                        onDeepSearchDraftRegenerate={() => workflow.regenerateDraft()}
                                        onDeepSearchDraftCancel={() => workflow.cancelDraft()}
                                        onDocumentAnalysisDraftConfirm={() => workflow.confirmDraft()}
                                        onDocumentAnalysisDraftChange={(draft) => workflow.confirmDraft(draft)}
                                        onDocumentAnalysisDraftRegenerate={() => workflow.regenerateDraft()}
                                        onDocumentAnalysisDraftCancel={() => workflow.cancelDraft()}
                                        onDeepSearchGenerateInterpretation={(books, draft) =>
                                            workflow.generateInterpretation(books, draft)
                                        }
                                        onDocumentAnalysisGenerateInterpretation={(books, draft) =>
                                            workflow.generateInterpretation(books, draft)
                                        }
                                        onSecondaryRetrieval={(books, query) =>
                                            workflow.secondaryRetrieval(books, query)
                                        }
                                        onGenerateInterpretation={(selectedBooks, userInput) =>
                                            workflow.generateInterpretation(
                                                selectedBooks,
                                                userInput,
                                                'simple'
                                            )
                                        }
                                    />

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
                                        busyLabel={busyLabel}
                                        onAbort={() => workflow.cancelOngoing()}
                                        documentUploadController={documentUploadController}
                                    />

                                    {displayedError && (
                                        <p className="px-4 sm:px-6 py-2 border-t border-[#C76B6B]/30 text-xs text-[#E58585] bg-[#C76B6B]/10 relative z-10 font-info-content">
                                            {displayedError}
                                        </p>
                                    )}
                                </>
                            )}

                            {accessState !== 'unlocked' && (
                                <AIBotPasswordGate
                                    checking={accessState === 'checking'}
                                    onUnlocked={() => setAccessState('unlocked')}
                                />
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
