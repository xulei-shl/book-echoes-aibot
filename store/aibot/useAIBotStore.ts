import { create } from 'zustand';
import type { UIMessage } from 'ai';
import type { DraftPayload } from '@/src/core/aibot/types';

interface AIBotState {
    isOverlayOpen: boolean;
    isDeepMode: boolean;
    isStreaming: boolean;
    isDraftLoading: boolean;
    pendingDraft: string | null;
    draftMetadata?: DraftPayload;
    messages: UIMessage[];
    error?: string;
    toggleOverlay: (force?: boolean) => void;
    setDeepMode: (value: boolean) => void;
    setMessages: (messages: UIMessage[]) => void;
    appendMessage: (message: UIMessage) => void;
    updateLastAssistantMessage: (content: string) => void;
    setPendingDraft: (draft: string | null, metadata?: DraftPayload) => void;
    setStreaming: (value: boolean) => void;
    setDraftLoading: (value: boolean) => void;
    setError: (message?: string) => void;
    reset: () => void;
}

const initialState: Omit<AIBotState, 'toggleOverlay' | 'setDeepMode' | 'setMessages' | 'setPendingDraft' | 'setStreaming' | 'setDraftLoading' | 'setError' | 'reset' | 'appendMessage' | 'updateLastAssistantMessage'> = {
    isOverlayOpen: false,
    isDeepMode: false,
    isStreaming: false,
    isDraftLoading: false,
    pendingDraft: null,
    draftMetadata: undefined,
    messages: [],
    error: undefined
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
                    next[i] = { ...next[i], content: content as any };
                    return { messages: next };
                }
            }
            next.push({
                id: crypto.randomUUID(),
                role: 'assistant',
                content: content as any
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
    reset: () => set({ ...initialState })
}));
