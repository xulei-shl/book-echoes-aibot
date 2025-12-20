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
        <div className="absolute left-12 right-4 bottom-16 bg-[#1B1B1B] border border-[#3A3A3A] rounded-lg p-3 max-h-32 overflow-y-auto">
            {/* 文档列表标题 */}
            <div className="flex items-center justify-between mb-2 text-xs text-[#A2A09A]">
                <span>已上传文档 ({documents.length}/{maxDocuments})</span>
                <span className="text-[#6F6D68]">支持 .md 格式</span>
            </div>

            {/* 文档网格 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {documents.map((document) => (
                    <div
                        key={document.id}
                        className={`
                            relative group flex items-center bg-[#2A2A2A] rounded-md p-2
                            border border-transparent hover:border-[#3A3A3A] transition-colors
                            ${document.status === 'error' ? 'border-red-900 bg-red-950/20' : ''}
                        `}
                    >
                        {/* 文档图标 */}
                        <div className={`
                            flex-shrink-0 w-6 h-6 rounded mr-2 flex items-center justify-center text-xs
                            ${document.status === 'ready'
                                ? 'bg-[#C9A063]/20 text-[#C9A063]'
                                : document.status === 'uploading'
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'bg-red-500/20 text-red-400'
                            }
                        `}>
                            {document.status === 'ready' ? (
                                // MD文档图标
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M12,11L8,15H10.5V19H13.5V15H16L12,11Z" />
                                </svg>
                            ) : document.status === 'uploading' ? (
                                // 上传中图标
                                <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                // 错误图标
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12,2L1,21H23M12,6L19.53,19H4.47M11,10V14H13V10M11,16V18H13V16" />
                                </svg>
                            )}
                        </div>

                        {/* 文档信息 */}
                        <div className="flex-1 min-w-0">
                            <div className="text-sm text-[#E8E6DC] truncate font-medium">
                                {document.name}
                            </div>
                            <div className="text-xs text-[#6F6D68] flex items-center gap-2">
                                <span>{formatFileSize(document.size)}</span>
                                <span>•</span>
                                <span>{formatUploadTime(document.uploadTime)}</span>
                            </div>
                        </div>

                        {/* 删除按钮 */}
                        <button
                            type="button"
                            onClick={() => onRemoveDocument(document.id)}
                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center text-xs"
                            title="删除文档"
                        >
                            ×
                        </button>

                        {/* 状态指示条 */}
                        {document.status === 'uploading' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500/30 overflow-hidden">
                                <div className="h-full bg-blue-500 animate-pulse"></div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* 底部提示 */}
            <div className="mt-2 text-xs text-[#6F6D68] text-center">
                {documents.length === maxDocuments
                    ? '已达到最大文档数量限制'
                    : `还可添加 ${maxDocuments - documents.length} 个文档`
                }
            </div>
        </div>
    );
}