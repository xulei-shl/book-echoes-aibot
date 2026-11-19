'use client';

import React from 'react';
import clsx from 'clsx';
import DocumentUploadButton from '@/components/aibot/DocumentUploadButton';
import DocumentUploadWorkflow, {
    type DocumentUploadController,
    MAX_DOCUMENTS
} from '@/components/aibot/DocumentUploadWorkflow';
import { AIBOT_MODES, type AIBotMode } from '@/src/core/aibot/constants';

export interface AIBotInputBarProps {
    inputValue: string;
    onInputChange: (val: string) => void;
    onSubmit: (e: React.FormEvent) => void;
    mode: AIBotMode;
    onModeToggle: () => void;
    onClear: () => void;
    onDownload: () => void;
    disabled?: boolean;
    busyLabel?: string;
    onAbort?: () => void;
    documentUploadController: DocumentUploadController;
}

export default function AIBotInputBar({
    inputValue,
    onInputChange,
    onSubmit,
    mode,
    onModeToggle,
    onClear,
    onDownload,
    disabled = false,
    busyLabel,
    onAbort,
    documentUploadController
}: AIBotInputBarProps) {
    const isDocumentMode = mode === AIBOT_MODES.DOCUMENT;
    const isDeepMode = mode === AIBOT_MODES.DEEP;
    const hasUploadedDocs = documentUploadController.uploadedDocuments.length > 0;

    return (
        <form
            id="aibot-form"
            className="space-y-2.5 px-4 sm:px-6 md:px-8 py-3 border-t border-[#C9A063]/20 bg-[#161514] relative z-10 shrink-0"
            onSubmit={onSubmit}
        >
            {/* 文档附件抽屉（仅在有文档时流式展开，零空白浪费） */}
            {hasUploadedDocs && (
                <DocumentUploadWorkflow controller={documentUploadController} />
            )}

            {/* 输入区（消除硬编码 150px 高度死区） */}
            <div className="relative">
                <textarea
                    value={inputValue}
                    onChange={(e) => onInputChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            const syntheticEvent = {
                                preventDefault: () => {},
                                currentTarget: e.currentTarget.form
                            } as React.FormEvent<HTMLFormElement>;
                            onSubmit(syntheticEvent);
                        }
                    }}
                    placeholder={
                        isDeepMode
                            ? '输入检索主题，启动全网研读与深度检索（Ctrl+Enter 发送）'
                            : isDocumentMode
                              ? '已载入参考文档，点击发送开始交叉研读...'
                              : '想检索关于什么主题的图书？输入问题或上传文档分析（Ctrl+Enter 发送）'
                    }
                    className="w-full h-16 sm:h-20 bg-[#111110] border border-[#C9A063]/25 p-3 text-sm text-[#E8E6DC] placeholder-[#7C7A74] focus:outline-none focus:border-[#C9A063] focus:ring-1 focus:ring-[#C9A063]/30 font-info-content about-overlay-scroll overflow-y-auto leading-relaxed transition-colors"
                    disabled={disabled}
                />
            </div>

            {/* 工具栏与提交按钮 */}
            <div className="flex items-center justify-between gap-2.5 flex-wrap">
                <div className="flex items-center gap-2 sm:gap-2.5 text-xs text-[#7C7A74] flex-wrap min-w-0">
                    <DocumentUploadButton
                        onFilesSelected={documentUploadController.handleFilesSelected}
                        disabled={disabled}
                        uploadedCount={documentUploadController.uploadedDocuments.length}
                        maxFiles={MAX_DOCUMENTS}
                    />

                    <button
                        type="button"
                        className={clsx(
                            'px-2.5 py-1 border text-xs font-mono tracking-wider transition-[background-color,border-color,color,transform] duration-150 shrink-0 whitespace-nowrap active:scale-[0.96]',
                            isDeepMode
                                ? 'border-[#C9A063] bg-[#C9A063] text-[#121110] font-medium'
                                : 'border-[#C9A063]/30 text-[#C9A063] hover:bg-[#C9A063]/15'
                        )}
                        onClick={onModeToggle}
                        title={isDeepMode ? '当前为深度模式（点击切回简单模式）' : '切换为深度检索模式'}
                    >
                        ⚡ 深度模式
                    </button>

                    {/* 模式指示器 */}
                    <div className="hidden sm:flex items-center gap-1.5 text-xs shrink-0 whitespace-nowrap px-1.5 py-0.5 border border-white/5 bg-[#121110]">
                        <span
                            className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                            style={{
                                backgroundColor:
                                    mode === AIBOT_MODES.TEXT
                                        ? '#3B82F6'
                                        : mode === AIBOT_MODES.DEEP
                                          ? '#C9A063'
                                          : '#A855F7'
                            }}
                        />
                        <span
                            className="font-mono text-[11px]"
                            style={{
                                color:
                                    mode === AIBOT_MODES.TEXT
                                        ? '#60A5FA'
                                        : mode === AIBOT_MODES.DEEP
                                          ? '#C9A063'
                                          : '#C084FC'
                            }}
                        >
                            {mode === AIBOT_MODES.TEXT
                                ? '简单检索'
                                : mode === AIBOT_MODES.DEEP
                                  ? '深度研读'
                                  : '文档分析'}
                        </span>
                    </div>

                    <button
                        type="button"
                        onClick={onClear}
                        disabled={disabled}
                        className="px-2.5 py-1 border border-[#C9A063]/25 text-[#A2A09A] hover:text-[#E8E6DC] hover:border-[#C9A063]/50 transition-[border-color,color,transform] duration-150 disabled:cursor-not-allowed disabled:opacity-40 text-xs font-mono tracking-wider shrink-0 whitespace-nowrap active:scale-[0.96]"
                        title="清空当前所有会话历史"
                    >
                        清空
                    </button>

                    <button
                        type="button"
                        onClick={onDownload}
                        className="px-2.5 py-1 border border-[#C9A063]/25 text-[#A2A09A] hover:text-[#C9A063] hover:border-[#C9A063]/50 transition-[border-color,color,transform] duration-150 text-xs font-mono tracking-wider shrink-0 whitespace-nowrap active:scale-[0.96]"
                        title="导出对话与报告为 Markdown 文件"
                    >
                        导出
                    </button>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {disabled && onAbort ? (
                        <button
                            type="button"
                            onClick={onAbort}
                            className="px-3.5 py-1.5 border border-[#C76B6B]/60 bg-[#C76B6B]/15 text-[#E58585] hover:bg-[#C76B6B]/25 active:scale-[0.96] text-xs font-mono tracking-wider transition-[background-color,border-color,transform] duration-150 flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer"
                            title="中断当前生成过程"
                        >
                            <span className="w-2 h-2 bg-[#C76B6B] rounded-sm shrink-0" />
                            <span>停止生成</span>
                        </button>
                    ) : (
                        <button
                            type="submit"
                            disabled={
                                disabled ||
                                (isDocumentMode && documentUploadController.statusStats.ready === 0) ||
                                documentUploadController.statusStats.uploading > 0
                            }
                            className="px-4 py-1.5 border border-[#C9A063] bg-[#C9A063] text-[#121110] font-medium text-xs font-mono tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-[background-color,color,transform] duration-150 hover:bg-[#D4AF37] shrink-0 whitespace-nowrap active:scale-[0.96]"
                        >
                            {busyLabel ||
                                (documentUploadController.statusStats.ready > 0 &&
                                documentUploadController.statusStats.uploading === 0
                                    ? `开始文档分析 (${documentUploadController.statusStats.ready})`
                                    : '发送')}
                        </button>
                    )}
                </div>
            </div>
        </form>
    );
}
