import type {
    PipelineState,
    PipelineSource,
    PipelineProgressLog
} from '@/types/aibot-pipeline';
import type { BookInfo } from '@/src/core/aibot/types';

export type PipelineAction =
    | { type: 'RESET' }
    | { type: 'START_ANALYSIS'; source: PipelineSource; initialPhase?: string }
    | { type: 'APPEND_LOG'; log: PipelineProgressLog; currentPhase?: string }
    | { type: 'UPDATE_LOG'; phase: string; updates: Partial<PipelineProgressLog> }
    | {
          type: 'SET_DRAFT';
          source: 'deep' | 'document';
          userInput: string;
          draftMarkdown: string;
          metadata?: Record<string, unknown>;
      }
    | { type: 'UPDATE_DRAFT'; draftMarkdown: string }
    | {
          type: 'START_BOOK_SEARCH';
          source: PipelineSource;
          userInput: string;
          draftMarkdown?: string;
          initialLogs?: PipelineProgressLog[];
      }
    | {
          type: 'SET_BOOKS';
          source: PipelineSource;
          userInput: string;
          draftMarkdown?: string;
          books: BookInfo[];
          selectedBookIds?: Set<string>;
      }
    | { type: 'TOGGLE_BOOK_SELECTION'; bookId: string; isSelected?: boolean }
    | { type: 'SET_SELECTED_BOOK_IDS'; selectedBookIds: Set<string> }
    | {
          type: 'START_INTERPRETING';
          source: PipelineSource;
          selectedBooks: BookInfo[];
          initialLogs?: PipelineProgressLog[];
      }
    | { type: 'APPEND_REPORT_CHUNK'; chunk: string }
    | { type: 'SET_REPORT'; reportMarkdown: string }
    | {
          type: 'COMPLETE';
          source: PipelineSource;
          selectedBooks: BookInfo[];
          reportMarkdown: string;
      }
    | {
          type: 'SET_ERROR';
          source: PipelineSource;
          error: string;
          recoverableState?: PipelineState;
      }
    | { type: 'RETRY' };

export const initialPipelineState: PipelineState = { status: 'idle' };

export function pipelineReducer(
    state: PipelineState,
    action: PipelineAction
): PipelineState {
    switch (action.type) {
        case 'RESET':
            return { status: 'idle' };

        case 'START_ANALYSIS':
            return {
                status: 'analyzing',
                source: action.source,
                logs: [],
                currentPhase: action.initialPhase || 'init'
            };

        case 'APPEND_LOG': {
            if (state.status === 'analyzing') {
                const existingIndex = state.logs.findIndex((l) => l.id === action.log.id);
                const nextLogs =
                    existingIndex >= 0
                        ? state.logs.map((l, idx) => (idx === existingIndex ? action.log : l))
                        : [...state.logs, action.log];
                return {
                    ...state,
                    logs: nextLogs,
                    currentPhase: action.currentPhase || action.log.phase || state.currentPhase
                };
            }
            if (state.status === 'searching-books' || state.status === 'interpreting') {
                const existingIndex = state.logs.findIndex((l) => l.id === action.log.id);
                const nextLogs =
                    existingIndex >= 0
                        ? state.logs.map((l, idx) => (idx === existingIndex ? action.log : l))
                        : [...state.logs, action.log];
                return {
                    ...state,
                    logs: nextLogs
                };
            }
            return state;
        }

        case 'UPDATE_LOG': {
            if (
                state.status === 'analyzing' ||
                state.status === 'searching-books' ||
                state.status === 'interpreting'
            ) {
                const nextLogs = state.logs.map((l) =>
                    l.phase === action.phase || l.id === action.phase
                        ? { ...l, ...action.updates }
                        : l
                );
                return {
                    ...state,
                    logs: nextLogs
                };
            }
            return state;
        }

        case 'SET_DRAFT':
            return {
                status: 'draft-review',
                source: action.source,
                userInput: action.userInput,
                draftMarkdown: action.draftMarkdown,
                metadata: action.metadata
            };

        case 'UPDATE_DRAFT':
            if (state.status === 'draft-review') {
                return {
                    ...state,
                    draftMarkdown: action.draftMarkdown
                };
            }
            return state;

        case 'START_BOOK_SEARCH':
            return {
                status: 'searching-books',
                source: action.source,
                userInput: action.userInput,
                draftMarkdown: action.draftMarkdown,
                logs: action.initialLogs || []
            };

        case 'SET_BOOKS':
            return {
                status: 'book-selection',
                source: action.source,
                userInput: action.userInput,
                draftMarkdown: action.draftMarkdown,
                books: action.books,
                selectedBookIds: action.selectedBookIds || new Set()
            };

        case 'TOGGLE_BOOK_SELECTION': {
            if (state.status === 'book-selection') {
                const nextIds = new Set(state.selectedBookIds);
                const shouldSelect =
                    action.isSelected !== undefined
                        ? action.isSelected
                        : !nextIds.has(action.bookId);
                if (shouldSelect) {
                    nextIds.add(action.bookId);
                } else {
                    nextIds.delete(action.bookId);
                }
                return {
                    ...state,
                    selectedBookIds: nextIds
                };
            }
            return state;
        }

        case 'SET_SELECTED_BOOK_IDS':
            if (state.status === 'book-selection') {
                return {
                    ...state,
                    selectedBookIds: new Set(action.selectedBookIds)
                };
            }
            return state;

        case 'START_INTERPRETING':
            return {
                status: 'interpreting',
                source: action.source,
                selectedBooks: action.selectedBooks,
                reportMarkdown: '',
                logs: action.initialLogs || []
            };

        case 'APPEND_REPORT_CHUNK':
            if (state.status === 'interpreting') {
                return {
                    ...state,
                    reportMarkdown: state.reportMarkdown + action.chunk
                };
            }
            return state;

        case 'SET_REPORT':
            if (state.status === 'interpreting') {
                return {
                    ...state,
                    reportMarkdown: action.reportMarkdown
                };
            }
            return state;

        case 'COMPLETE':
            return {
                status: 'completed',
                source: action.source,
                selectedBooks: action.selectedBooks,
                reportMarkdown: action.reportMarkdown
            };

        case 'SET_ERROR':
            return {
                status: 'error',
                source: action.source,
                error: action.error,
                recoverableState: action.recoverableState || (state.status !== 'error' ? state : undefined)
            };

        case 'RETRY':
            if (state.status === 'error' && state.recoverableState) {
                return state.recoverableState;
            }
            return state;

        default:
            return state;
    }
}
