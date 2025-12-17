import { create } from 'zustand';
import type { UIMessage } from 'ai';
import type { DraftPayload, RetrievalResultData, RetrievalPhase, BookSelectionState } from '@/src/core/aibot/types';

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
}

const initialState: Omit<AIBotState, 'toggleOverlay' | 'setDeepMode' | 'setMessages' | 'setPendingDraft' | 'setStreaming' | 'setDraftLoading' | 'setError' | 'reset' | 'appendMessage' | 'updateLastAssistantMessage' | 'setRetrievalResult' | 'clearRetrievalResults' | 'setRetrievalPhase' | 'setCurrentRetrievalResult' | 'setSelectedBookIds' | 'setOriginalQuery' | 'setIsGeneratingInterpretation' | 'addSelectedBook' | 'removeSelectedBook' | 'clearSelection'> = {
    isOverlayOpen: false,
    isDeepMode: false,
    isStreaming: false,
    isDraftLoading: false,
    pendingDraft: null,
    draftMetadata: undefined,
    messages: [],
    error: undefined,
    retrievalResults: new Map(),
    
    // 新增状态初始值
    retrievalPhase: 'search',
    currentRetrievalResult: undefined,
    selectedBookIds: new Set(),
    originalQuery: '',
    isGeneratingInterpretation: false,
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
    clearSelection: () => set({ selectedBookIds: new Set() })
}));
