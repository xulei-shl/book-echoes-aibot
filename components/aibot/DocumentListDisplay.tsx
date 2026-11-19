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

    return (
        <div className="bg-[#141312]/90 border border-[#C9A063]/25 p-2 sm:p-2.5 space-y-1.5">
            {/* 文档列表标题 */}
            <div className="flex items-center justify-between text-[11px] text-[#C9A063]">
                <span className="font-mono tracking-wider font-medium">
                    待分析文档 ({documents.length}/{maxDocuments})
                </span>
                <span className="text-[#A2A09A] text-[10px] font-info-content">支持 .md 文件</span>
            </div>

            {/* 文档胶囊列表 */}
            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto about-overlay-scroll pr-1">
                {documents.map((document) => (
                    <div
                        key={document.id}
                        className={`
                            relative group flex items-center gap-2 bg-[#1b1a18] px-2.5 py-1
                            border border-[#C9A063]/30 hover:border-[#C9A063]/60 transition-colors
                            ${document.status === 'error' ? 'border-red-500/50 bg-red-950/20 text-red-300' : ''}
                        `}
                    >
                        {/* 状态指示 */}
                        <div className="flex-shrink-0">
                            {document.status === 'ready' ? (
                                <span className="text-[#C9A063] text-xs">📄</span>
                            ) : document.status === 'uploading' ? (
                                <div className="w-2.5 h-2.5 border border-[#C9A063] border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <span className="text-red-400 text-xs">⚠️</span>
                            )}
                        </div>

                        {/* 文档信息 */}
                        <div className="min-w-0 max-w-[160px] sm:max-w-[200px]">
                            <div className="text-xs text-[#E8E6DC] truncate font-info-content">
                                {document.name}
                            </div>
                        </div>

                        <span className="text-[10px] text-[#A2A09A] font-mono tabular-nums shrink-0">
                            {formatFileSize(document.size)}
                        </span>

                        {/* 删除按钮（扩大热区至40px） */}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemoveDocument(document.id);
                            }}
                            className="relative ml-0.5 text-[#A2A09A] hover:text-red-400 p-0.5 transition-colors cursor-pointer after:absolute after:-inset-2 after:content-['']"
                            title={`移除 ${document.name}`}
                            aria-label={`移除 ${document.name}`}
                        >
                            <span className="font-mono text-sm leading-none">×</span>
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}