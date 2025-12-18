import { create } from 'zustand';
import type { UIMessage } from 'ai';
import type {
    DraftPayload,
    RetrievalResultData,
    RetrievalPhase,
    BookSelectionState,
    DeepSearchPhase,
    DeepSearchLogEntry,
    KeywordResult,
    DuckDuckGoSnippet,
    BookInfo
} from '@/src/core/aibot/types';

interface AIBotState {
    isOverlayOpen: boolean;
    isDeepMode: boolean;
    isStreaming: boolean;
    isDraftLoading: boolean;
    pendingDraft: string | null;
    draftMetadata?: DraftPayload;
    messages: UIMessage[];
    error?: string;
    retrievalResults: Map<string, RetrievalResultData>; // 消息ID -> 检索结果

    // 新增：图书选择相关状态
    retrievalPhase: RetrievalPhase;
    currentRetrievalResult?: RetrievalResultData;
    selectedBookIds: Set<string>;
    originalQuery: string;
    isGeneratingInterpretation: boolean;

    // ========== 深度检索对话式状态 ==========
    deepSearchPhase: DeepSearchPhase;
    // 进度相关
    deepSearchProgressMessageId: string | null;
    deepSearchLogs: DeepSearchLogEntry[];
    deepSearchCurrentLogPhase: string;
    // 草稿相关
    deepSearchDraftMessageId: string | null;
    deepSearchDraftContent: string;
    isDeepSearchDraftStreaming: boolean;
    isDeepSearchDraftComplete: boolean;
    deepSearchSnippets: DuckDuckGoSnippet[];
    deepSearchKeywords: KeywordResult[];
    // 图书相关
    deepSearchBooksMessageId: string | null;
    deepSearchBooks: BookInfo[];
    deepSearchSelectedBooks: BookInfo[];
    // 报告相关
    deepSearchReportMessageId: string | null;
    deepSearchReportContent: string;
    isDeepSearchReportStreaming: boolean;
    // 原始输入
    deepSearchUserInput: string;

    // 原有actions
    toggleOverlay: (force?: boolean) => void;
    setDeepMode: (value: boolean) => void;
    setMessages: (messages: UIMessage[]) => void;
    appendMessage: (message: UIMessage) => void;
    updateLastAssistantMessage: (content: string) => void;
    setPendingDraft: (draft: string | null, metadata?: DraftPayload) => void;
    setStreaming: (value: boolean) => void;
    setDraftLoading: (value: boolean) => void;
    setError: (message?: string) => void;
    setRetrievalResult: (messageId: string, result: RetrievalResultData) => void;
    clearRetrievalResults: () => void;
    reset: () => void;

    // 新增actions
    setRetrievalPhase: (phase: RetrievalPhase) => void;
    setCurrentRetrievalResult: (result?: RetrievalResultData) => void;
    setSelectedBookIds: (bookIds: Set<string>) => void;
    setOriginalQuery: (query: string) => void;
    setIsGeneratingInterpretation: (generating: boolean) => void;
    addSelectedBook: (bookId: string) => void;
    removeSelectedBook: (bookId: string) => void;
    clearSelection: () => void;

    // ========== 深度检索对话式 actions ==========
    setDeepSearchPhase: (phase: DeepSearchPhase) => void;
    // 进度相关
    setDeepSearchProgressMessageId: (id: string | null) => void;
    addDeepSearchLog: (log: DeepSearchLogEntry) => void;
    updateDeepSearchLog: (phase: string, updates: Partial<DeepSearchLogEntry>) => void;
    clearDeepSearchLogs: () => void;
    // 草稿相关
    setDeepSearchDraftMessageId: (id: string | null) => void;
    appendDeepSearchDraftContent: (chunk: string) => void;
    setDeepSearchDraftContent: (content: string) => void;
    setDeepSearchDraftStreaming: (streaming: boolean) => void;
    setDeepSearchDraftComplete: (complete: boolean) => void;
    setDeepSearchSnippets: (snippets: DuckDuckGoSnippet[]) => void;
    setDeepSearchKeywords: (keywords: KeywordResult[]) => void;
    // 图书相关
    setDeepSearchBooksMessageId: (id: string | null) => void;
    setDeepSearchBooks: (books: BookInfo[]) => void;
    setDeepSearchSelectedBooks: (books: BookInfo[]) => void;
    // 报告相关
    setDeepSearchReportMessageId: (id: string | null) => void;
    appendDeepSearchReportContent: (chunk: string) => void;
    setDeepSearchReportContent: (content: string) => void;
    setDeepSearchReportStreaming: (streaming: boolean) => void;
    // 原始输入
    setDeepSearchUserInput: (input: string) => void;
    // 重置深度检索状态
    resetDeepSearch: () => void;
    // 更新指定消息内容（用于流式更新）
    updateMessageContent: (messageId: string, content: string) => void;
}

// 深度检索初始状态
const deepSearchInitialState = {
    deepSearchPhase: 'idle' as DeepSearchPhase,
    deepSearchProgressMessageId: null as string | null,
    deepSearchLogs: [] as DeepSearchLogEntry[],
    deepSearchCurrentLogPhase: '',
    deepSearchDraftMessageId: null as string | null,
    deepSearchDraftContent: '',
    isDeepSearchDraftStreaming: false,
    isDeepSearchDraftComplete: false,
    deepSearchSnippets: [] as DuckDuckGoSnippet[],
    deepSearchKeywords: [] as KeywordResult[],
    deepSearchBooksMessageId: null as string | null,
    deepSearchBooks: [] as BookInfo[],
    deepSearchSelectedBooks: [] as BookInfo[],
    deepSearchReportMessageId: null as string | null,
    deepSearchReportContent: '',
    isDeepSearchReportStreaming: false,
    deepSearchUserInput: ''
};

const initialState = {
    isOverlayOpen: false,
    isDeepMode: false,
    isStreaming: false,
    isDraftLoading: false,
    pendingDraft: null as string | null,
    draftMetadata: undefined as DraftPayload | undefined,
    messages: [] as UIMessage[],
    error: undefined as string | undefined,
    retrievalResults: new Map<string, RetrievalResultData>(),

    // 图书选择相关状态
    retrievalPhase: 'search' as RetrievalPhase,
    currentRetrievalResult: undefined as RetrievalResultData | undefined,
    selectedBookIds: new Set<string>(),
    originalQuery: '',
    isGeneratingInterpretation: false,

    // 深度检索对话式状态
    ...deepSearchInitialState
};

export const useAIBotStore = create<AIBotState>((set) => ({
    ...initialState,
    toggleOverlay: (force) =>
        set((state) => {
            const next = typeof force === 'boolean' ? force : !state.isOverlayOpen;
            console.log('[useAIBotStore] toggleOverlay', {
                force,
                currentState: {
                    isOverlayOpen: state.isOverlayOpen,
                    isDeepMode: state.isDeepMode,
                    messagesCount: state.messages.length,
                    hasPendingDraft: !!state.pendingDraft
                },
                next,
                willReset: !next
            });
            return next ? { ...state, isOverlayOpen: true } : { ...initialState };
        }),
    setDeepMode: (value) => set((state) => {
        console.log('[useAIBotStore] setDeepMode', {
            from: state.isDeepMode,
            to: value
        });
        return { isDeepMode: value };
    }),
    setMessages: (messages) => set((state) => {
        console.log('[useAIBotStore] setMessages', {
            from: state.messages.length,
            to: messages.length,
            messagePreview: messages.map(msg => ({
                role: msg.role
            }))
        });
        return { messages };
    }),
    appendMessage: (message) =>
        set((state) => ({
            messages: [...state.messages, message]
        })),
    updateLastAssistantMessage: (content) =>
        set((state) => {
            const next = [...state.messages];
            for (let i = next.length - 1; i >= 0; i -= 1) {
                if (next[i].role === 'assistant') {
                    (next[i] as any).content = content;
                    return { messages: next };
                }
            }
            next.push({
                id: crypto.randomUUID(),
                role: 'assistant',
                content
            } as any);
            return { messages: next };
        }),
    setPendingDraft: (draft, metadata) =>
        set((state) => ({
            pendingDraft: draft,
            draftMetadata:
                metadata === undefined ? state.draftMetadata : metadata === null ? undefined : metadata
        })),
    setStreaming: (value) => set({ isStreaming: value }),
    setDraftLoading: (value) => set({ isDraftLoading: value }),
    setError: (message) => set({ error: message }),
    setRetrievalResult: (messageId, result) =>
        set((state) => {
            const newRetrievalResults = new Map(state.retrievalResults);
            newRetrievalResults.set(messageId, result);
            return { retrievalResults: newRetrievalResults };
        }),
    clearRetrievalResults: () => set({ retrievalResults: new Map() }),
    reset: () => set({ ...initialState, retrievalResults: new Map() }),
    
    // 新增actions实现
    setRetrievalPhase: (phase) => set({ retrievalPhase: phase }),
    setCurrentRetrievalResult: (result) => set({ currentRetrievalResult: result }),
    setSelectedBookIds: (bookIds) => set({ selectedBookIds: bookIds }),
    setOriginalQuery: (query) => set({ originalQuery: query }),
    setIsGeneratingInterpretation: (generating) => set({ isGeneratingInterpretation: generating }),
    addSelectedBook: (bookId) => set((state) => {
        const newSelection = new Set(state.selectedBookIds);
        newSelection.add(bookId);
        return { selectedBookIds: newSelection };
    }),
    removeSelectedBook: (bookId) => set((state) => {
        const newSelection = new Set(state.selectedBookIds);
        newSelection.delete(bookId);
        return { selectedBookIds: newSelection };
    }),
    clearSelection: () => set({ selectedBookIds: new Set() }),

    // ========== 深度检索对话式 actions 实现 ==========
    setDeepSearchPhase: (phase) => set({ deepSearchPhase: phase }),

    // 进度相关
    setDeepSearchProgressMessageId: (id) => set({ deepSearchProgressMessageId: id }),
    addDeepSearchLog: (log) => set((state) => {
        // 检查是否已存在该 phase 的日志，如果存在则更新
        const existingIndex = state.deepSearchLogs.findIndex(l => l.phase === log.phase);
        if (existingIndex >= 0) {
            const newLogs = [...state.deepSearchLogs];
            newLogs[existingIndex] = log;
            return { deepSearchLogs: newLogs, deepSearchCurrentLogPhase: log.phase };
        }
        return {
            deepSearchLogs: [...state.deepSearchLogs, log],
            deepSearchCurrentLogPhase: log.phase
        };
    }),
    updateDeepSearchLog: (phase, updates) => set((state) => {
        const newLogs = state.deepSearchLogs.map(log =>
            log.phase === phase ? { ...log, ...updates } : log
        );
        return { deepSearchLogs: newLogs };
    }),
    clearDeepSearchLogs: () => set({ deepSearchLogs: [], deepSearchCurrentLogPhase: '' }),

    // 草稿相关
    setDeepSearchDraftMessageId: (id) => set({ deepSearchDraftMessageId: id }),
    appendDeepSearchDraftContent: (chunk) => set((state) => ({
        deepSearchDraftContent: state.deepSearchDraftContent + chunk
    })),
    setDeepSearchDraftContent: (content) => set({ deepSearchDraftContent: content }),
    setDeepSearchDraftStreaming: (streaming) => set({ isDeepSearchDraftStreaming: streaming }),
    setDeepSearchDraftComplete: (complete) => set({ isDeepSearchDraftComplete: complete }),
    setDeepSearchSnippets: (snippets) => set({ deepSearchSnippets: snippets }),
    setDeepSearchKeywords: (keywords) => set({ deepSearchKeywords: keywords }),

    // 图书相关
    setDeepSearchBooksMessageId: (id) => set({ deepSearchBooksMessageId: id }),
    setDeepSearchBooks: (books) => set({ deepSearchBooks: books }),
    setDeepSearchSelectedBooks: (books) => set({ deepSearchSelectedBooks: books }),

    // 报告相关
    setDeepSearchReportMessageId: (id) => set({ deepSearchReportMessageId: id }),
    appendDeepSearchReportContent: (chunk) => set((state) => ({
        deepSearchReportContent: state.deepSearchReportContent + chunk
    })),
    setDeepSearchReportContent: (content) => set({ deepSearchReportContent: content }),
    setDeepSearchReportStreaming: (streaming) => set({ isDeepSearchReportStreaming: streaming }),

    // 原始输入
    setDeepSearchUserInput: (input) => set({ deepSearchUserInput: input }),

    // 重置深度检索状态
    resetDeepSearch: () => set({ ...deepSearchInitialState }),

    // 更新指定消息内容（用于流式更新）
    updateMessageContent: (messageId, content) => set((state) => {
        const newMessages = state.messages.map(msg =>
            msg.id === messageId ? { ...msg, content } as UIMessage : msg
        );
        return { messages: newMessages };
    })
}));
