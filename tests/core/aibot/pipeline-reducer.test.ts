import { describe, it, expect } from 'vitest';
import {
    pipelineReducer,
    initialPipelineState,
    type PipelineAction
} from '@/components/aibot/controllers/pipelineReducer';
import type { BookInfo } from '@/src/core/aibot/types';

const mockBook: BookInfo = {
    id: 'book-1',
    title: '卡拉马佐夫兄弟',
    author: '陀思妥耶夫斯基',
    similarityScore: 0.95
};

describe('pipelineReducer', () => {
    it('initializes with idle state', () => {
        expect(initialPipelineState).toEqual({ status: 'idle' });
    });

    it('handles START_ANALYSIS correctly', () => {
        const next = pipelineReducer(initialPipelineState, {
            type: 'START_ANALYSIS',
            source: 'deep',
            initialPhase: 'keyword'
        });

        expect(next).toEqual({
            status: 'analyzing',
            source: 'deep',
            logs: [],
            currentPhase: 'keyword'
        });
    });

    it('handles APPEND_LOG and UPDATE_LOG in analyzing state', () => {
        let state = pipelineReducer(initialPipelineState, {
            type: 'START_ANALYSIS',
            source: 'document'
        });

        const log1 = {
            id: 'log-1',
            timestamp: '10:00:00',
            phase: 'document-analysis',
            status: 'running' as const,
            message: '正在提取文档...'
        };

        state = pipelineReducer(state, {
            type: 'APPEND_LOG',
            log: log1,
            currentPhase: 'document-analysis'
        });

        if (state.status !== 'analyzing') throw new Error('Expected analyzing state');
        expect(state.logs).toHaveLength(1);
        expect(state.currentPhase).toBe('document-analysis');

        state = pipelineReducer(state, {
            type: 'UPDATE_LOG',
            phase: 'document-analysis',
            updates: { status: 'completed' as const, message: '提取完成' }
        });

        if (state.status !== 'analyzing') throw new Error('Expected analyzing state');
        expect(state.logs[0].status).toBe('completed');
        expect(state.logs[0].message).toBe('提取完成');
    });

    it('handles SET_DRAFT and UPDATE_DRAFT in draft-review state', () => {
        let state = pipelineReducer(initialPipelineState, {
            type: 'SET_DRAFT',
            source: 'deep',
            userInput: '存在主义哲学',
            draftMarkdown: '# 存在主义大纲'
        });

        expect(state).toEqual({
            status: 'draft-review',
            source: 'deep',
            userInput: '存在主义哲学',
            draftMarkdown: '# 存在主义大纲',
            metadata: undefined
        });

        state = pipelineReducer(state, {
            type: 'UPDATE_DRAFT',
            draftMarkdown: '# 存在主义大纲（已修订）'
        });

        if (state.status !== 'draft-review') throw new Error('Expected draft-review state');
        expect(state.draftMarkdown).toBe('# 存在主义大纲（已修订）');
    });

    it('handles book search and selection workflow', () => {
        let state = pipelineReducer(initialPipelineState, {
            type: 'START_BOOK_SEARCH',
            source: 'deep',
            userInput: '存在主义哲学',
            draftMarkdown: '# 草稿'
        });

        expect(state.status).toBe('searching-books');

        state = pipelineReducer(state, {
            type: 'SET_BOOKS',
            source: 'deep',
            userInput: '存在主义哲学',
            draftMarkdown: '# 草稿',
            books: [mockBook]
        });

        if (state.status !== 'book-selection') throw new Error('Expected book-selection');
        expect(state.books).toHaveLength(1);
        expect(state.selectedBookIds.size).toBe(0);

        // Toggle selection
        state = pipelineReducer(state, {
            type: 'TOGGLE_BOOK_SELECTION',
            bookId: 'book-1'
        });
        if (state.status !== 'book-selection') throw new Error('Expected book-selection');
        expect(state.selectedBookIds.has('book-1')).toBe(true);

        state = pipelineReducer(state, {
            type: 'TOGGLE_BOOK_SELECTION',
            bookId: 'book-1',
            isSelected: false
        });
        if (state.status !== 'book-selection') throw new Error('Expected book-selection');
        expect(state.selectedBookIds.has('book-1')).toBe(false);
    });

    it('handles interpreting and report chunk streaming', () => {
        let state = pipelineReducer(initialPipelineState, {
            type: 'START_INTERPRETING',
            source: 'deep',
            selectedBooks: [mockBook]
        });

        if (state.status !== 'interpreting') throw new Error('Expected interpreting');
        expect(state.reportMarkdown).toBe('');

        state = pipelineReducer(state, {
            type: 'APPEND_REPORT_CHUNK',
            chunk: '第一章：'
        });
        state = pipelineReducer(state, {
            type: 'APPEND_REPORT_CHUNK',
            chunk: '荒谬与反抗。'
        });

        if (state.status !== 'interpreting') throw new Error('Expected interpreting');
        expect(state.reportMarkdown).toBe('第一章：荒谬与反抗。');

        state = pipelineReducer(state, {
            type: 'COMPLETE',
            source: 'deep',
            selectedBooks: [mockBook],
            reportMarkdown: state.reportMarkdown
        });

        expect(state).toEqual({
            status: 'completed',
            source: 'deep',
            selectedBooks: [mockBook],
            reportMarkdown: '第一章：荒谬与反抗。'
        });
    });

    it('handles SET_ERROR and RETRY with recoverableState', () => {
        const reviewState = pipelineReducer(initialPipelineState, {
            type: 'SET_DRAFT',
            source: 'deep',
            userInput: '卡夫卡',
            draftMarkdown: '变形记草稿'
        });

        const errorState = pipelineReducer(reviewState, {
            type: 'SET_ERROR',
            source: 'deep',
            error: '网络连接超时'
        });

        expect(errorState).toEqual({
            status: 'error',
            source: 'deep',
            error: '网络连接超时',
            recoverableState: reviewState
        });

        const restored = pipelineReducer(errorState, { type: 'RETRY' });
        expect(restored).toEqual(reviewState);
    });

    it('handles RESET from any state', () => {
        const errorState: PipelineAction = {
            type: 'SET_ERROR',
            source: 'simple',
            error: '出错'
        };
        const next = pipelineReducer(initialPipelineState, errorState);
        const resetState = pipelineReducer(next, { type: 'RESET' });
        expect(resetState).toEqual({ status: 'idle' });
    });
});
