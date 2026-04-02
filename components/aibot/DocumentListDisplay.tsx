'use client';

import React from 'react';
import type { UploadedDocument } from '@/src/core/aibot/types';

interface DocumentListDisplayProps {
    documents: UploadedDocument[];
    onRemoveDocument: (documentId: string) => void;
    maxDocuments?: number;
}

export default function DocumentListDisplay({
    documents,
    onRemoveDocument,
    maxDocuments = 5
}: DocumentListDisplayProps) {
    if (documents.length === 0) {
        return null;
    }

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const formatUploadTime = (date: Date): string => {
        return date.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="aibot-panel aibot-scroll max-h-40 overflow-y-auto p-3">
            {/* 文档列表标题 */}
            <div className="mb-3 flex items-center justify-between text-xs text-[#A2A09A] font-info-content">
                <span className="text-[#D8CEBD]">已上传文档 ({documents.length}/{maxDocuments})</span>
                <span className="text-[#6F6D68]">支持 .md 格式</span>
            </div>

            {/* 文档网格 */}
            <div className="grid grid-cols-1 gap-2">
                {documents.map((document) => (
                    <div
                        key={document.id}
                        className={`relative group flex items-center gap-3 rounded-[1.15rem] border px-3 py-3 transition-colors ${
                            document.status === 'error'
                                ? 'border-red-400/18 bg-red-400/8'
                                : 'border-[#E8E6DC]/8 bg-[#151412] hover:border-[#C9A063]/18'
                        }`}
                    >
                        {/* 文档图标 */}
                        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-xs ${
                            document.status === 'ready'
                                ? 'bg-[#C9A063]/15 text-[#C9A063]'
                                : document.status === 'uploading'
                                ? 'bg-[#7B9DAE]/18 text-[#9DBBCB]'
                                : 'bg-red-400/12 text-red-300'
                        }`}>
                            {document.status === 'ready' ? (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M12,11L8,15H10.5V19H13.5V15H16L12,11Z" />
                                </svg>
                            ) : document.status === 'uploading' ? (
                                <div className="h-3 w-3 rounded-full border border-current border-t-transparent animate-spin"></div>
                            ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12,2L1,21H23M12,6L19.53,19H4.47M11,10V14H13V10M11,16V18H13V16" />
                                </svg>
                            )}
                        </div>

                        {/* 文档信息 */}
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-[#E8E6DC] font-info-content">
                                {document.name}
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-xs text-[#7F786D] font-info-content">
                                <span>{formatFileSize(document.size)}</span>
                                <span>•</span>
                                <span>{formatUploadTime(document.uploadTime)}</span>
                            </div>
                        </div>

                        <span className={`aibot-chip ${
                            document.status === 'ready'
                                ? 'aibot-chip--success'
                                : document.status === 'uploading'
                                ? 'aibot-chip--active'
                                : 'aibot-chip--error'
                        }`}>
                            {document.status === 'ready' ? '已就绪' : document.status === 'uploading' ? '上传中' : '错误'}
                        </span>

                        {/* 删除按钮 */}
                        <button
                            type="button"
                            onClick={() => onRemoveDocument(document.id)}
                            className="aibot-btn aibot-btn--ghost absolute right-2 top-2 h-7 w-7 p-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                            title="删除文档"
                        >
                            ×
                        </button>

                        {/* 状态指示条 */}
                        {document.status === 'uploading' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden rounded-b-[1.15rem] bg-[#7B9DAE]/16">
                                <div className="h-full animate-pulse bg-[#7B9DAE]"></div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* 底部提示 */}
            <div className="mt-3 text-center text-xs text-[#7F786D] font-info-content">
                {documents.length === maxDocuments
                    ? '已达到最大文档数量限制'
                    : `还可添加 ${maxDocuments - documents.length} 个文档`
                }
            </div>
        </div>
    );
}