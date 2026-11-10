import { create } from 'zustand';
import { AIBOT_MODES, type AIBotMode } from '@/src/core/aibot/constants';
import type { Message as UIMessage } from '@ai-sdk/ui-utils';
import type {
    RetrievalResultData,
    RetrievalPhase,
    DeepSearchPhase,
    DeepSearchLogEntry,
    UploadedDocument,
    DocumentUploadPhase,
    DocumentAnalysisLogEntry,
    DocumentAnalysisPhase
} from '@/src/core/aibot/types';

/** 消息 content 除纯文本外，还会承载结构化消息对象（深度检索 / 文档分析各阶段） */
export type AIBotMessageInput = string | Record<string, unknown>;

/** AIBot 内部消息（SDK 的 Message 只把 content 声明为 string，这里放宽以适应结构化内容） */
export type AIBotMessage = Omit<UIMessage, 'content'> & { content: AIBotMessageInput };

export interface AIBotState {
    // 模态弹窗状态与全局模式
    isOverlayOpen: boolean;
    mode: AIBotMode;
    isDeepMode: boolean;

    // 对话历史与检索结果缓存
    messages: UIMessage[];
    retrievalResults: Map<string, RetrievalResultData>;
    error?: string;

    // 文档上传状态
    uploadedDocuments: UploadedDocument[];
    documentUploadPhase: DocumentUploadPhase;
    documentUploadError?: string;

    // 全局核心 actions
    toggleOverlay: (force?: boolean) => void;
    setMode: (mode: AIBotMode) => void;
    setDeepMode: (value: boolean) => void;
    setMessages: (messages: AIBotMessage[]) => void;
    appendMessage: (message: AIBotMessage) => void;
    updateLastAssistantMessage: (content: string) => void;
    updateMessageContent: (messageId: string, content: AIBotMessageInput) => void;
    setRetrievalResult: (messageId: string, result: RetrievalResultData) => void;
    clearRetrievalResults: () => void;
    setError: (message?: string) => void;
    reset: () => void;

    // 文档管理 actions
    setUploadedDocuments: (documents: UploadedDocument[]) => void;
    addUploadedDocument: (document: UploadedDocument) => void;
    removeUploadedDocument: (documentId: string) => void;
    clearUploadedDocuments: () => void;
    setDocumentUploadPhase: (phase: DocumentUploadPhase) => void;
    setDocumentUploadError: (error?: string) => void;

    // ========== 向后兼容废弃字段（现由 useAIBotWorkflow 状态机管辖） ==========
    /** @deprecated 由 useAIBotWorkflow 管辖 */
    isStreaming: boolean;
    /** @deprecated 由 useAIBotWorkflow 管辖 */
    retrievalPhase: RetrievalPhase;
    /** @deprecated 由 useAIBotWorkflow 管辖 */
    selectedBookIds: Set<string>;
    /** @deprecated 由 useAIBotWorkflow 管辖 */
    deepSearchPhase: DeepSearchPhase;
    /** @deprecated 由 useAIBotWorkflow 管辖 */
    deepSearchLogs: DeepSearchLogEntry[];
    /** @deprecated 由 useAIBotWorkflow 管辖 */
    documentAnalysisPhase: DocumentAnalysisPhase;
    /** @deprecated 由 useAIBotWorkflow 管辖 */
    documentAnalysisLogs: DocumentAnalysisLogEntry[];

    /** @deprecated 由 useAIBotWorkflow 管辖 */
    setStreaming: (value: boolean) => void;
    /** @deprecated 由 useAIBotWorkflow 管辖 */
    setRetrievalPhase: (phase: RetrievalPhase) => void;
    /** @deprecated 由 useAIBotWorkflow 管辖 */
    setSelectedBookIds: (bookIds: Set<string>) => void;
    /** @deprecated 由 useAIBotWorkflow 管辖 */
    setDeepSearchPhase: (phase: DeepSearchPhase) => void;
    /** @deprecated 由 useAIBotWorkflow 管辖 */
    addDeepSearchLog: (log: DeepSearchLogEntry) => void;
    /** @deprecated 由 useAIBotWorkflow 管辖 */
    clearDeepSearchLogs: () => void;
    /** @deprecated 由 useAIBotWorkflow 管辖 */
    setDocumentAnalysisPhase: (phase: DocumentAnalysisPhase) => void;
    /** @deprecated 由 useAIBotWorkflow 管辖 */
    addDocumentAnalysisLog: (log: DocumentAnalysisLogEntry) => void;
    /** @deprecated 由 useAIBotWorkflow 管辖 */
    clearDocumentAnalysisLogs: () => void;
    /** @deprecated 由 useAIBotWorkflow 管辖 */
    resetDeepSearch: () => void;
    /** @deprecated 由 useAIBotWorkflow 管辖 */
    resetDocumentAnalysis: () => void;
}

const initialState = {
    isOverlayOpen: false,
    mode: AIBOT_MODES.TEXT as AIBotMode,
    isDeepMode: false,
    messages: [] as UIMessage[],
    retrievalResults: new Map<string, RetrievalResultData>(),
    error: undefined as string | undefined,

    uploadedDocuments: [] as UploadedDocument[],
    documentUploadPhase: 'idle' as DocumentUploadPhase,
    documentUploadError: undefined as string | undefined,

    // 兼容初始值
    isStreaming: false,
    retrievalPhase: 'search' as RetrievalPhase,
    selectedBookIds: new Set<string>(),
    deepSearchPhase: 'idle' as DeepSearchPhase,
    deepSearchLogs: [] as DeepSearchLogEntry[],
    documentAnalysisPhase: 'idle' as DocumentAnalysisPhase,
    documentAnalysisLogs: [] as DocumentAnalysisLogEntry[]
};

export const useAIBotStore = create<AIBotState>((set) => ({
    ...initialState,

    toggleOverlay: (force?: boolean) =>
        set((state) => ({
            isOverlayOpen: force !== undefined ? force : !state.isOverlayOpen
        })),

    setMode: (mode: AIBotMode) =>
        set({
            mode,
            isDeepMode: mode === AIBOT_MODES.DEEP
        }),

    setDeepMode: (value: boolean) =>
        set({
            isDeepMode: value,
            mode: value ? AIBOT_MODES.DEEP : AIBOT_MODES.TEXT
        }),

    setMessages: (messages: AIBotMessage[]) =>
        set({
            messages: messages as UIMessage[]
        }),

    appendMessage: (message: AIBotMessage) =>
        set((state) => ({
            messages: [...state.messages, message as UIMessage]
        })),

    updateLastAssistantMessage: (content: string) =>
        set((state) => {
            const nextMessages = [...state.messages];
            for (let i = nextMessages.length - 1; i >= 0; i--) {
                if (nextMessages[i].role === 'assistant') {
                    nextMessages[i] = {
                        ...nextMessages[i],
                        content
                    };
                    break;
                }
            }
            return { messages: nextMessages };
        }),

    updateMessageContent: (messageId: string, content: AIBotMessageInput) =>
        set((state) => ({
            messages: state.messages.map((msg) =>
                msg.id === messageId ? ({ ...msg, content } as UIMessage) : msg
            )
        })),

    setRetrievalResult: (messageId: string, result: RetrievalResultData) =>
        set((state) => {
            const newMap = new Map(state.retrievalResults);
            newMap.set(messageId, result);
            return { retrievalResults: newMap };
        }),

    clearRetrievalResults: () =>
        set({
            retrievalResults: new Map<string, RetrievalResultData>()
        }),

    setError: (message?: string) => set({ error: message }),

    reset: () =>
        set({
            ...initialState,
            retrievalResults: new Map<string, RetrievalResultData>(),
            uploadedDocuments: []
        }),

    setUploadedDocuments: (documents: UploadedDocument[]) =>
        set({ uploadedDocuments: documents }),

    addUploadedDocument: (document: UploadedDocument) =>
        set((state) => ({
            uploadedDocuments: [...state.uploadedDocuments, document]
        })),

    removeUploadedDocument: (documentId: string) =>
        set((state) => ({
            uploadedDocuments: state.uploadedDocuments.filter((d) => d.id !== documentId)
        })),

    clearUploadedDocuments: () =>
        set({
            uploadedDocuments: [],
            documentUploadPhase: 'idle',
            documentUploadError: undefined
        }),

    setDocumentUploadPhase: (phase: DocumentUploadPhase) =>
        set({ documentUploadPhase: phase }),

    setDocumentUploadError: (error?: string) =>
        set({ documentUploadError: error }),

    // 兼容实现
    setStreaming: (isStreaming) => set({ isStreaming }),
    setRetrievalPhase: (retrievalPhase) => set({ retrievalPhase }),
    setSelectedBookIds: (selectedBookIds) => set({ selectedBookIds }),
    setDeepSearchPhase: (deepSearchPhase) => set({ deepSearchPhase }),
    addDeepSearchLog: (log) =>
        set((state) => ({ deepSearchLogs: [...state.deepSearchLogs, log] })),
    clearDeepSearchLogs: () => set({ deepSearchLogs: [] }),
    setDocumentAnalysisPhase: (documentAnalysisPhase) => set({ documentAnalysisPhase }),
    addDocumentAnalysisLog: (log) =>
        set((state) => ({
            documentAnalysisLogs: [...state.documentAnalysisLogs, log]
        })),
    clearDocumentAnalysisLogs: () => set({ documentAnalysisLogs: [] }),
    resetDeepSearch: () =>
        set({
            deepSearchPhase: 'idle',
            deepSearchLogs: []
        }),
    resetDocumentAnalysis: () =>
        set({
            documentAnalysisPhase: 'idle',
            documentAnalysisLogs: []
        })
}));
