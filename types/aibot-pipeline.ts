import type { BookInfo } from '@/src/core/aibot/types';

export type PipelineSource = 'simple' | 'deep' | 'document';

export type PipelineProgressLog = {
    id: string;
    timestamp: string;
    phase: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    message: string;
    details?: string;
};

export type PipelineState =
    | { status: 'idle' }
    | {
        status: 'analyzing';
        source: PipelineSource;
        logs: PipelineProgressLog[];
        currentPhase: string;
      }
    | {
        status: 'draft-review';
        source: 'deep' | 'document';
        userInput: string;
        draftMarkdown: string;
        metadata?: Record<string, unknown>; // 搜索 snippets 或文档列表
      }
    | {
        status: 'searching-books';
        source: PipelineSource;
        userInput: string;
        draftMarkdown?: string;
        logs: PipelineProgressLog[];
      }
    | {
        status: 'book-selection';
        source: PipelineSource;
        userInput: string;
        draftMarkdown?: string;
        books: BookInfo[];
        selectedBookIds: Set<string>;
      }
    | {
        status: 'interpreting';
        source: PipelineSource;
        selectedBooks: BookInfo[];
        reportMarkdown: string;
        logs: PipelineProgressLog[];
      }
    | {
        status: 'completed';
        source: PipelineSource;
        selectedBooks: BookInfo[];
        reportMarkdown: string;
      }
    | {
        status: 'error';
        source: PipelineSource;
        error: string;
        recoverableState?: PipelineState; // 支持一键重试回到上一步
      };
