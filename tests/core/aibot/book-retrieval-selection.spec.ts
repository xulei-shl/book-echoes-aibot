import { describe, it, expect } from 'vitest';
import { formatBooksForSecondarySearch } from '@/src/utils/format-book-for-search';
import { pipelineReducer, initialPipelineState } from '@/components/aibot/controllers/pipelineReducer';
import type { BookInfo } from '@/src/core/aibot/types';

describe('Book Selection & Secondary Retrieval', () => {
    const book1: BookInfo = {
        id: 'book-1',
        title: '职业倦怠',
        author: '乔纳森·马莱西克',
        description: '本书从科学维度生动描绘职业倦怠究竟是怎样的感受和体验，探索倦怠为什么困扰着成千万的打工人。',
        similarityScore: 0.88,
        callNumber: 'C913/1234'
    };

    const book2: BookInfo = {
        id: 'book-2',
        title: '倦怠的社会',
        author: '韩炳哲',
        description: '否定性社会转向肯定性社会，功绩主体陷入自我剥削。',
        similarityScore: 0.79
    };

    describe('formatBooksForSecondarySearch', () => {
        it('returns originalQuery when no books are selected', () => {
            const result = formatBooksForSecondarySearch([], '工作压力');
            expect(result).toBe('工作压力');
        });

        it('formats selected books into structured prompt with title, author, and description', () => {
            const result = formatBooksForSecondarySearch([book1, book2], '职业发展焦虑');
            expect(result).toContain('基于以下图书继续检索：');
            expect(result).toContain('【1】《职业倦怠》');
            expect(result).toContain('作者: 乔纳森·马莱西克');
            expect(result).toContain('【2】《倦怠的社会》');
            expect(result).toContain('作者: 韩炳哲');
            expect(result).toContain('原始需求：职业发展焦虑');
            expect(result).toContain('请继续深入检索相关图书');
        });

        it('truncates overly long descriptions (>100 chars)', () => {
            const longBook: BookInfo = {
                id: 'book-long',
                title: '长文本图书',
                description: 'A'.repeat(150)
            };
            const result = formatBooksForSecondarySearch([longBook], '测试');
            expect(result).toContain('简介: ' + 'A'.repeat(100) + '...');
        });
    });

    describe('Secondary Query Construction in Workflow', () => {
        it('constructs combined query with book titles in quotation marks', () => {
            const books = [book1, book2];
            const query = '职场心理';
            const bookTitles = books.map((b) => `《${b.title}》`).join(' ');
            const combinedQuery = query ? `${query} ${bookTitles}`.trim() : bookTitles;

            expect(combinedQuery).toBe('职场心理 《职业倦怠》 《倦怠的社会》');
        });

        it('handles empty original query by providing book titles alone', () => {
            const books = [book1];
            const query = '';
            const bookTitles = books.map((b) => `《${b.title}》`).join(' ');
            const combinedQuery = query ? `${query} ${bookTitles}`.trim() : bookTitles;

            expect(combinedQuery).toBe('《职业倦怠》');
        });
    });

    describe('Book Selection State Transitions', () => {
        it('sets books and initializes selectedBookIds correctly in pipeline reducer', () => {
            const state = pipelineReducer(initialPipelineState, {
                type: 'SET_BOOKS',
                source: 'simple',
                userInput: '倦怠',
                books: [book1, book2]
            });

            expect(state.status).toBe('book-selection');
            if (state.status === 'book-selection') {
                expect(state.books).toHaveLength(2);
                expect(state.selectedBookIds.size).toBe(0);
            }
        });

        it('toggles book selection accurately', () => {
            let state = pipelineReducer(initialPipelineState, {
                type: 'SET_BOOKS',
                source: 'simple',
                userInput: '倦怠',
                books: [book1, book2]
            });

            state = pipelineReducer(state, {
                type: 'TOGGLE_BOOK_SELECTION',
                bookId: 'book-1'
            });

            if (state.status === 'book-selection') {
                expect(state.selectedBookIds.has('book-1')).toBe(true);
                expect(state.selectedBookIds.size).toBe(1);
            }

            state = pipelineReducer(state, {
                type: 'TOGGLE_BOOK_SELECTION',
                bookId: 'book-1'
            });

            if (state.status === 'book-selection') {
                expect(state.selectedBookIds.has('book-1')).toBe(false);
                expect(state.selectedBookIds.size).toBe(0);
            }
        });

        it('sets batch selected books', () => {
            let state = pipelineReducer(initialPipelineState, {
                type: 'SET_BOOKS',
                source: 'simple',
                userInput: '倦怠',
                books: [book1, book2]
            });

            state = pipelineReducer(state, {
                type: 'SET_SELECTED_BOOK_IDS',
                selectedBookIds: new Set(['book-1', 'book-2'])
            });

            if (state.status === 'book-selection') {
                expect(state.selectedBookIds.size).toBe(2);
                expect(state.selectedBookIds.has('book-1')).toBe(true);
                expect(state.selectedBookIds.has('book-2')).toBe(true);
            }
        });
    });
});
