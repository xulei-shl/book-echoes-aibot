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
    documentUploadController
}: AIBotInputBarProps) {
    const isDocumentMode = mode === AIBOT_MODES.DOCUMENT;
    const isDeepMode = mode === AIBOT_MODES.DEEP;

    return (
        <form
            id="aibot-form"
            className="space-y-3 px-6 md:px-10 py-4 border-t border-[#C9A063]/20 bg-[#1a1a1a] relative z-10 shrink-0"
            onSubmit={onSubmit}
        >
            {/* 输入区与文档上传抽屉 */}
            <div className="relative" style={{ minHeight: '150px' }}>
                <textarea
                    value={inputValue}
                    onChange={(e) => onInputChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.ctrlKey) {
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
                            ? '输入检索主题，开始深度检索（Ctrl+Enter 发送）'
                            : isDocumentMode
                              ? '文档分析模式中，请等待分析完成...'
                              : '想检索关于什么主题的图书？或点击左下角上传文档分析（Ctrl+Enter 发送）'
                    }
                    className="w-full h-24 bg-[#111111]/80 border border-[#C9A063]/20 rounded-none p-4 text-sm text-[#E8E6DC] focus:outline-none focus:border-[#C9A063] font-info-content about-overlay-scroll overflow-y-auto"
                    disabled={disabled}
                />

                {/* 文档上传工作流组件 - 在简单模式和文档模式下显示 */}
                {(mode === AIBOT_MODES.TEXT || mode === AIBOT_MODES.DOCUMENT) && (
                    <DocumentUploadWorkflow controller={documentUploadController} />
                )}
            </div>

            {/* 工具栏与提交按钮 */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-[#7C7A74]">
                    <DocumentUploadButton
                        onFilesSelected={documentUploadController.handleFilesSelected}
                        disabled={disabled}
                        uploadedCount={documentUploadController.uploadedDocuments.length}
                        maxFiles={MAX_DOCUMENTS}
                    />

                    <button
                        type="button"
                        className={clsx(
                            'px-3 py-1 border text-xs font-mono tracking-wider transition-colors duration-300',
                            isDeepMode
                                ? 'border-[#C9A063] bg-[#C9A063] text-[#1a1a1a]'
                                : 'border-[#C9A063]/30 text-[#C9A063] hover:bg-[#C9A063] hover:text-[#1a1a1a]'
                        )}
                        onClick={onModeToggle}
                    >
                        深度检索
                    </button>

                    {/* 模式指示器 */}
                    <div className="flex items-center gap-1 text-xs">
                        <span
                            className="inline-block w-2 h-2 rounded-full shrink-0"
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
                                ? '简单'
                                : mode === AIBOT_MODES.DEEP
                                  ? '深度'
                                  : '文档'}
                        </span>
                    </div>

                    <button
                        type="button"
                        onClick={onClear}
                        disabled={disabled}
                        className="px-3 py-1 border border-[#C9A063]/30 text-[#C9A063] hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors duration-300 disabled:cursor-not-allowed disabled:text-[#555] text-xs font-mono tracking-wider"
                    >
                        清空
                    </button>

                    <button
                        type="button"
                        onClick={onDownload}
                        className="px-3 py-1 border border-[#C9A063]/30 text-[#C9A063] hover:bg-[#C9A063] hover:text-[#1a1a1a] transition-colors duration-300 text-xs font-mono tracking-wider"
                    >
                        下载
                    </button>
                </div>

                <button
                    type="submit"
                    disabled={
                        disabled ||
                        isDocumentMode ||
                        documentUploadController.statusStats.uploading > 0
                    }
                    className="px-4 py-2 border border-[#C9A063] bg-[#C9A063] text-[#1a1a1a] text-sm font-mono tracking-wider disabled:opacity-50 transition-colors duration-300 hover:bg-[#C9A063]/20 hover:text-[#C9A063]"
                >
                    {busyLabel ||
                        (documentUploadController.statusStats.ready > 0 &&
                        documentUploadController.statusStats.uploading === 0
                            ? `开始分析 (${documentUploadController.statusStats.ready})`
                            : '发送')}
                </button>
            </div>
        </form>
    );
}
