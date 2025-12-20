'use client';

import React, { useCallback } from 'react';
import DocumentUploadButton from './DocumentUploadButton';
import DocumentListDisplay from './DocumentListDisplay';
import { useAIBotStore } from '@/store/aibot/useAIBotStore';
import type { UploadedDocument } from '@/src/core/aibot/types';

interface DocumentUploadWorkflowProps {
    onDocumentAnalysisStart: (documents: UploadedDocument[]) => void;
    disabled?: boolean;
    isAnalyzing?: boolean;  // 新增：是否正在分析中
}

const MAX_DOCUMENTS = 5;

export default function DocumentUploadWorkflow({
    onDocumentAnalysisStart,
    disabled = false,
    isAnalyzing = false
}: DocumentUploadWorkflowProps) {
    const {
        uploadedDocuments,
        documentUploadError,
        setUploadedDocuments,
        addUploadedDocument,
        removeUploadedDocument,
        setDocumentUploadError
    } = useAIBotStore();

    
    const handleFilesSelected = useCallback(async (files: File[]) => {
        try {
            setDocumentUploadError(undefined);

            // 处理每个文件
            for (const file of files) {
                try {
                    // 读取文件内容
                    const content = await file.text();

                    // 创建就绪状态的文档对象
                    const readyDocument: UploadedDocument = {
                        id: crypto.randomUUID(),
                        name: file.name,
                        content,
                        size: file.size,
                        uploadTime: new Date(),
                        status: 'ready'
                    };

                    // 直接添加到上传列表
                    addUploadedDocument(readyDocument);

                } catch (error) {
                    console.error('读取文件失败:', file.name, error);

                    // 创建错误状态的文档对象
                    const errorDocument: UploadedDocument = {
                        id: crypto.randomUUID(),
                        name: file.name,
                        content: '',
                        size: file.size,
                        uploadTime: new Date(),
                        status: 'error'
                    };

                    // 添加到上传列表
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

        // 清除错误信息（如果存在）
        if (documentUploadError) {
            setDocumentUploadError(undefined);
        }
    }, [removeUploadedDocument, documentUploadError, setDocumentUploadError]);

    const handleSubmitDocuments = useCallback(() => {
        const readyDocuments = uploadedDocuments.filter(doc => doc.status === 'ready');

        if (readyDocuments.length === 0) {
            setDocumentUploadError('没有可分析的文档，请等待上传完成或重新上传');
            return;
        }

        // 开始文档分析
        onDocumentAnalysisStart(readyDocuments);
    }, [uploadedDocuments, onDocumentAnalysisStart, setDocumentUploadError]);

    // 获取当前状态的统计
    const statusStats = {
        uploading: uploadedDocuments.filter(doc => doc.status === 'uploading').length,
        ready: uploadedDocuments.filter(doc => doc.status === 'ready').length,
        error: uploadedDocuments.filter(doc => doc.status === 'error').length
    };

    const hasUploading = statusStats.uploading > 0;
    const hasReadyDocuments = statusStats.ready > 0;
    const hasErrorDocuments = statusStats.error > 0;

    return (
        <div className="relative">
            {/* 上传按钮和文档列表容器 */}
            <div className="relative">
                {/* 文档上传按钮 */}
                <DocumentUploadButton
                    onFilesSelected={handleFilesSelected}
                    disabled={disabled || isAnalyzing}
                    uploadedCount={uploadedDocuments.length}
                    maxFiles={MAX_DOCUMENTS}
                />

                {/* 文档列表显示 */}
                <DocumentListDisplay
                    documents={uploadedDocuments}
                    onRemoveDocument={handleRemoveDocument}
                    maxDocuments={MAX_DOCUMENTS}
                />
            </div>

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
            {uploadedDocuments.length > 0 && (
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
                            onClick={handleSubmitDocuments}
                            disabled={disabled || !hasReadyDocuments}
                            className="px-3 py-1 bg-[#C9A063] text-black rounded hover:bg-[#B8935A] disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium transition-colors"
                        >
                            开始分析 ({statusStats.ready})
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}