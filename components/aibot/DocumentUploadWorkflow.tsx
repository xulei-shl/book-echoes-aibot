'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DocumentListDisplay from './DocumentListDisplay';
import { useAIBotStore } from '@/store/aibot/useAIBotStore';
import type { UploadedDocument } from '@/src/core/aibot/types';

export const MAX_DOCUMENTS = 5;

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
                        id: generateUUID(),
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
                        id: generateUUID(),
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
        <div className="mt-3 space-y-3">
            {/* 文档列表显示 */}
            <DocumentListDisplay
                documents={uploadedDocuments}
                onRemoveDocument={handleRemoveDocument}
                maxDocuments={MAX_DOCUMENTS}
            />

            {/* 错误信息显示 */}
            {documentUploadError && (
                <div className="flex items-center justify-between rounded-[1.15rem] border border-red-400/18 bg-red-400/10 px-3 py-2 text-xs text-red-200 font-info-content">
                    <span>{documentUploadError}</span>
                    <button
                        type="button"
                        onClick={() => setDocumentUploadError(undefined)}
                        className="aibot-btn aibot-btn--ghost h-7 w-7 p-0 text-red-200"
                        title="关闭错误提示"
                    >
                        ×
                    </button>
                </div>
            )}

            {/* 状态指示器 */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-info-content text-[#6F6D68]">
                {hasUploading && (
                    <span className="aibot-chip aibot-chip--active">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#C9A063] animate-pulse" />
                        上传中 {statusStats.uploading}
                    </span>
                )}
                {hasReadyDocuments && (
                    <span className="aibot-chip aibot-chip--success">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                        就绪 {statusStats.ready}
                    </span>
                )}
                {hasErrorDocuments && (
                    <span className="aibot-chip aibot-chip--error">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-300" />
                        错误 {statusStats.error}
                    </span>
                )}
            </div>
        </div>
    );
}
