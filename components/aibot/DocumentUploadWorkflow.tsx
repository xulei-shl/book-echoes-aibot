'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DocumentListDisplay from './DocumentListDisplay';
import { useAIBotStore } from '@/store/aibot/useAIBotStore';
import type { UploadedDocument } from '@/src/core/aibot/types';

export const MAX_DOCUMENTS = 5;

export interface DocumentUploadController {
    uploadedDocuments: UploadedDocument[];
    documentUploadError?: string;
    setDocumentUploadError: (message?: string) => void;
    handleFilesSelected: (files: File[]) => Promise<void>;
    handleRemoveDocument: (documentId: string) => void;
    handleSubmitDocuments: () => boolean;
    statusStats: {
        uploading: number;
        ready: number;
        error: number;
    };
}

export function useDocumentUploadController(
    onDocumentAnalysisStart: (documents: UploadedDocument[]) => void
): DocumentUploadController {
    const {
        uploadedDocuments,
        documentUploadError,
        addUploadedDocument,
        removeUploadedDocument,
        setDocumentUploadError
    } = useAIBotStore();

    const handleFilesSelected = useCallback(async (files: File[]) => {
        try {
            setDocumentUploadError(undefined);

            for (const file of files) {
                try {
                    const content = await file.text();
                    const readyDocument: UploadedDocument = {
                        id: crypto.randomUUID(),
                        name: file.name,
                        content,
                        size: file.size,
                        uploadTime: new Date(),
                        status: 'ready'
                    };
                    addUploadedDocument(readyDocument);
                } catch (error) {
                    console.error('读取文件失败:', file.name, error);
                    const errorDocument: UploadedDocument = {
                        id: crypto.randomUUID(),
                        name: file.name,
                        content: '',
                        size: file.size,
                        uploadTime: new Date(),
                        status: 'error'
                    };
                    addUploadedDocument(errorDocument);
                }
            }
        } catch (error) {
            console.error('文件上传处理失败:', error);
            setDocumentUploadError('文件上传失败，请重试');
        }
    }, [addUploadedDocument, setDocumentUploadError]);

    const handleRemoveDocument = useCallback((documentId: string) => {
        removeUploadedDocument(documentId);
        if (documentUploadError) {
            setDocumentUploadError(undefined);
        }
    }, [removeUploadedDocument, documentUploadError, setDocumentUploadError]);

    const handleSubmitDocuments = useCallback(() => {
        const readyDocuments = uploadedDocuments.filter(doc => doc.status === 'ready');
        if (readyDocuments.length === 0) {
            setDocumentUploadError('没有可分析的文档，请等待上传完成或重新上传');
            return false;
        }
        onDocumentAnalysisStart(readyDocuments);
        return true;
    }, [uploadedDocuments, onDocumentAnalysisStart, setDocumentUploadError]);

    const statusStats = useMemo(() => ({
        uploading: uploadedDocuments.filter(doc => doc.status === 'uploading').length,
        ready: uploadedDocuments.filter(doc => doc.status === 'ready').length,
        error: uploadedDocuments.filter(doc => doc.status === 'error').length
    }), [uploadedDocuments]);

    return {
        uploadedDocuments,
        documentUploadError,
        setDocumentUploadError,
        handleFilesSelected,
        handleRemoveDocument,
        handleSubmitDocuments,
        statusStats
    };
}

interface DocumentUploadWorkflowProps {
    controller: DocumentUploadController;
    disabled?: boolean;
    isAnalyzing?: boolean;
}

export default function DocumentUploadWorkflow({
    controller,
    disabled = false,
    isAnalyzing = false
}: DocumentUploadWorkflowProps) {
    const {
        uploadedDocuments,
        documentUploadError,
        setDocumentUploadError,
        handleRemoveDocument,
        handleSubmitDocuments,
        statusStats
    } = controller;

    const hasUploading = statusStats.uploading > 0;
    const hasReadyDocuments = statusStats.ready > 0;
    const hasErrorDocuments = statusStats.error > 0;

    const [isListVisible, setIsListVisible] = useState(true);

    useEffect(() => {
        if (uploadedDocuments.length > 0) {
            setIsListVisible(true);
        }
    }, [uploadedDocuments.length]);

    const handleStartAnalysis = useCallback(() => {
        const started = handleSubmitDocuments();
        if (started) {
            setIsListVisible(false);
        }
    }, [handleSubmitDocuments]);

    if (uploadedDocuments.length === 0 || !isListVisible) {
        return null;
    }

    return (
        <div className="relative">
            {/* 文档列表显示 */}
            <DocumentListDisplay
                documents={uploadedDocuments}
                onRemoveDocument={handleRemoveDocument}
                maxDocuments={MAX_DOCUMENTS}
            />

            {/* 错误信息显示 */}
            {documentUploadError && (
                <div className="absolute left-12 right-4 bottom-12 mb-2 p-2 bg-red-950/30 border border-red-800/50 rounded text-xs text-red-400">
                    <div className="flex items-center justify-between">
                        <span>{documentUploadError}</span>
                        <button
                            type="button"
                            onClick={() => setDocumentUploadError(undefined)}
                            className="ml-2 text-red-300 hover:text-red-200"
                            title="关闭错误提示"
                        >
                            ×
                        </button>
                    </div>
                </div>
            )}

            {/* 状态指示器 */}
            <div className="absolute left-12 right-4 bottom-8 flex items-center justify-between text-xs text-[#6F6D68]">
                <div className="flex items-center gap-4">
                    {hasUploading && (
                        <span className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                            上传中 {statusStats.uploading}
                        </span>
                    )}
                    {hasReadyDocuments && (
                        <span className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                            就绪 {statusStats.ready}
                        </span>
                    )}
                    {hasErrorDocuments && (
                        <span className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                            错误 {statusStats.error}
                        </span>
                    )}
                </div>

                {/* 分析按钮 */}
                {hasReadyDocuments && !hasUploading && (
                    <button
                        type="button"
                        onClick={handleStartAnalysis}
                        disabled={disabled || isAnalyzing || !hasReadyDocuments}
                        className="px-3 py-1 bg-[#C9A063] text-black rounded hover:bg-[#B8935A] disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium transition-colors"
                    >
                        开始分析 ({statusStats.ready})
                    </button>
                )}
            </div>
        </div>
    );
}
