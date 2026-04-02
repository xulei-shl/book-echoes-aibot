'use client';

import React, { useRef } from 'react';
import type { UploadedDocument } from '@/src/core/aibot/types';

interface DocumentUploadButtonProps {
    onFilesSelected: (files: File[]) => void | Promise<void>;
    disabled?: boolean;
    uploadedCount?: number;
    maxFiles?: number;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export default function DocumentUploadButton({
    onFilesSelected,
    disabled = false,
    uploadedCount = 0,
    maxFiles = 5
}: DocumentUploadButtonProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleClick = () => {
        if (!disabled && fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);

        if (files.length === 0) return;

        // 检查数量限制
        const totalAfterUpload = uploadedCount + files.length;
        if (totalAfterUpload > maxFiles) {
            alert(`最多只能上传${maxFiles}个文档，当前已上传${uploadedCount}个`);
            return;
        }

        // 验证文件格式和大小
        const validFiles: File[] = [];
        const invalidFiles: string[] = [];

        files.forEach(file => {
            // 检查文件格式
            if (!file.name.toLowerCase().endsWith('.md')) {
                invalidFiles.push(`${file.name}（仅支持.md格式）`);
                return;
            }

            // 检查文件大小
            if (file.size > MAX_FILE_SIZE) {
                invalidFiles.push(`${file.name}（文件大小超过5MB限制）`);
                return;
            }

            validFiles.push(file);
        });

        // 显示错误信息
        if (invalidFiles.length > 0) {
            alert('以下文件无法上传：\n' + invalidFiles.join('\n'));
        }

        // 处理有效文件
        if (validFiles.length > 0) {
            onFilesSelected(validFiles);
        }

        // 重置input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const isNearLimit = uploadedCount >= maxFiles - 1;
    const buttonDisabled = disabled || uploadedCount >= maxFiles;
    const hasUploadedDocuments = uploadedCount > 0;

    return (
        <div className="relative flex items-center gap-2">
            <button
                type="button"
                onClick={handleClick}
                disabled={buttonDisabled}
                className={`aibot-btn ${
                    buttonDisabled
                        ? 'aibot-btn--ghost'
                        : hasUploadedDocuments
                            ? 'aibot-btn--secondary border-[#C9A063]/38 text-[#E8D7BB]'
                            : 'aibot-btn--ghost'
                }`}
                title={buttonDisabled
                    ? `已达到最大文档数量限制（${maxFiles}个）`
                    : `上传Markdown文档（${uploadedCount}/${maxFiles}）`
                }
            >
                上传文档
            </button>

            <input
                ref={fileInputRef}
                type="file"
                accept=".md"
                multiple
                onChange={handleFileChange}
                className="hidden"
                disabled={buttonDisabled}
            />

            {/* 数量提示 */}
            {uploadedCount > 0 && (
                <span className={`aibot-chip ${isNearLimit ? 'aibot-chip--active' : ''}`}>
                    {uploadedCount}/{maxFiles}
                </span>
            )}
        </div>
    );
}
