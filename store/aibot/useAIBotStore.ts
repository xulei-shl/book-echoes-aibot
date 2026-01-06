import { create } from 'zustand';
import { AIBOT_MODES } from '@/src/core/aibot/constants';
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
    BookInfo,
    UploadedDocument,
    DocumentUploadPhase,
    DocumentAnalysisState,
    DocumentAnalysisLogEntry,
    DocumentAnalysisPhase
} from '@/src/core/aibot/types';
import type { AIBotMode } from '@/src/core/aibot/constants';

interface AIBotState {
    isOverlayOpen: boolean;
    // 新的模式系统：simple（简单检索）、deep（深度检索）、document（文档上传）
    mode: AIBotMode;
    // 保持向后兼容的isDeepMode属性
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

    // ========== 文档上传相关状态 ==========
    uploadedDocuments: UploadedDocument[];
    documentUploadPhase: DocumentUploadPhase;
    documentUploadError?: string;
    // 文档分析状态（复用深度检索的状态结构）
    documentAnalysisPhase: DocumentAnalysisPhase;
    documentAnalysisProgressMessageId: string | null;
    documentAnalysisLogs: DocumentAnalysisLogEntry[];
    documentAnalysisCurrentLogPhase: string;
    documentAnalysisDraftMessageId: string | null;
    documentAnalysisDraftContent: string;
    isDocumentAnalysisDraftStreaming: boolean;
    isDocumentAnalysisDraftComplete: boolean;
    documentAnalysisDocumentAnalyses: string[];
    documentAnalysisBooksMessageId: string | null;
    documentAnalysisBooks: BookInfo[];
    documentAnalysisSelectedBooks: BookInfo[];
    documentAnalysisReportMessageId: string | null;
    documentAnalysisReportContent: string;
    isDocumentAnalysisReportStreaming: boolean;
    documentAnalysisUserInput: string;

    // 原有actions
    toggleOverlay: (force?: boolean) => void;
    setMode: (mode: AIBotMode) => void;
    // 保持向后兼容的setDeepMode
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

    // ========== 文档上传相关 actions ==========
    // 文档管理
    setUploadedDocuments: (documents: UploadedDocument[]) => void;
    addUploadedDocument: (document: UploadedDocument) => void;
    removeUploadedDocument: (documentId: string) => void;
    clearUploadedDocuments: () => void;
    setDocumentUploadPhase: (phase: DocumentUploadPhase) => void;
    setDocumentUploadError: (error?: string) => void;

    // 文档分析状态管理（复用深度检索的模式）
    setDocumentAnalysisPhase: (phase: DocumentAnalysisPhase) => void;
    setDocumentAnalysisProgressMessageId: (id: string | null) => void;
    addDocumentAnalysisLog: (log: DocumentAnalysisLogEntry) => void;
    updateDocumentAnalysisLog: (phase: string, updates: Partial<DocumentAnalysisLogEntry>) => void;
    clearDocumentAnalysisLogs: () => void;
    setDocumentAnalysisDraftMessageId: (id: string | null) => void;
    appendDocumentAnalysisDraftContent: (chunk: string) => void;
    setDocumentAnalysisDraftContent: (content: string) => void;
    setDocumentAnalysisDraftStreaming: (streaming: boolean) => void;
    setDocumentAnalysisDraftComplete: (complete: boolean) => void;
    setDocumentAnalysisDocumentAnalyses: (analyses: string[]) => void;
    setDocumentAnalysisBooksMessageId: (id: string | null) => void;
    setDocumentAnalysisBooks: (books: BookInfo[]) => void;
    setDocumentAnalysisSelectedBooks: (books: BookInfo[]) => void;
    setDocumentAnalysisReportMessageId: (id: string | null) => void;
    appendDocumentAnalysisReportContent: (chunk: string) => void;
    setDocumentAnalysisReportContent: (content: string) => void;
    setDocumentAnalysisReportStreaming: (streaming: boolean) => void;
    setDocumentAnalysisUserInput: (input: string) => void;
    resetDocumentAnalysis: () => void;
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

// 文档分析初始状态
const documentAnalysisInitialState = {
    documentAnalysisPhase: 'idle' as DocumentAnalysisPhase,
    documentAnalysisProgressMessageId: null as string | null,
    documentAnalysisLogs: [] as DocumentAnalysisLogEntry[],
    documentAnalysisCurrentLogPhase: '',
    documentAnalysisDraftMessageId: null as string | null,
    documentAnalysisDraftContent: '',
    isDocumentAnalysisDraftStreaming: false,
    isDocumentAnalysisDraftComplete: false,
    documentAnalysisDocumentAnalyses: [] as string[],
    documentAnalysisBooksMessageId: null as string | null,
    documentAnalysisBooks: [] as BookInfo[],
    documentAnalysisSelectedBooks: [] as BookInfo[],
    documentAnalysisReportMessageId: null as string | null,
    documentAnalysisReportContent: '',
    isDocumentAnalysisReportStreaming: false,
    documentAnalysisUserInput: ''
};

const initialState = {
    isOverlayOpen: false,
    mode: AIBOT_MODES.TEXT as AIBotMode,
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
    ...deepSearchInitialState,

    // 文档上传相关状态
    uploadedDocuments: [] as UploadedDocument[],
    documentUploadPhase: 'idle' as DocumentUploadPhase,
    documentUploadError: undefined as string | undefined,

    // 文档分析状态
    ...documentAnalysisInitialState
};

export const useAIBotStore = create<AIBotState>((set) => ({
    ...initialState,
    setMode: (mode) => set((state) => {
        // 同时更新isDeepMode以保持向后兼容
        const isDeepMode = mode === AIBOT_MODES.DEEP;
        console.log('[useAIBotStore] setMode', { mode, isDeepMode });
        return { mode, isDeepMode };
    }),
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
        // 更新模式，向后兼容
        const mode = value ? AIBOT_MODES.DEEP : AIBOT_MODES.TEXT;
        console.log('[useAIBotStore] setDeepMode', {
            from: state.isDeepMode,
            to: value,
            mode
        });
        return { mode, isDeepMode: value };
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
    }),

    // ========== 文档上传相关 actions ==========
    // 文档管理
    setUploadedDocuments: (documents) => set((state) => {
        console.log('[useAIBotStore] setUploadedDocuments', {
            oldCount: state.uploadedDocuments.length,
            newCount: documents.length,
            documents: documents.map(doc => ({
                id: doc.id,
                name: doc.name,
                status: doc.status
            }))
        });
        return { uploadedDocuments: documents };
    }),
    addUploadedDocument: (document) => set((state) => {
        console.log('[useAIBotStore] addUploadedDocument', {
            documentId: document.id,
            documentName: document.name,
            documentStatus: document.status,
            oldCount: state.uploadedDocuments.length,
            newCount: state.uploadedDocuments.length + 1
        });
        return {
            uploadedDocuments: [...state.uploadedDocuments, document]
        };
    }),
    removeUploadedDocument: (documentId) => set((state) => ({
        uploadedDocuments: state.uploadedDocuments.filter(doc => doc.id !== documentId)
    })),
    clearUploadedDocuments: () => set({ uploadedDocuments: [] }),
    setDocumentUploadPhase: (phase) => set({ documentUploadPhase: phase }),
    setDocumentUploadError: (error) => set({ documentUploadError: error }),

    // 文档分析状态管理（复用深度检索的模式）
    setDocumentAnalysisPhase: (phase) => set({ documentAnalysisPhase: phase }),
    setDocumentAnalysisProgressMessageId: (id) => set({ documentAnalysisProgressMessageId: id }),
    addDocumentAnalysisLog: (log) => set((state) => {
        const newLogs = [...state.documentAnalysisLogs];
        const existingIndex = newLogs.findIndex(l => l.phase === log.phase);
        if (existingIndex >= 0) {
            newLogs[existingIndex] = log;
        } else {
            newLogs.push(log);
        }
        return { documentAnalysisLogs: newLogs };
    }),
    updateDocumentAnalysisLog: (phase, updates) => set((state) => {
        const newLogs = state.documentAnalysisLogs.map(log =>
            log.phase === phase ? { ...log, ...updates } : log
        );
        return { documentAnalysisLogs: newLogs };
    }),
    clearDocumentAnalysisLogs: () => set({ documentAnalysisLogs: [], documentAnalysisCurrentLogPhase: '' }),
    setDocumentAnalysisDraftMessageId: (id) => set({ documentAnalysisDraftMessageId: id }),
    appendDocumentAnalysisDraftContent: (chunk) => set((state) => ({
        documentAnalysisDraftContent: state.documentAnalysisDraftContent + chunk
    })),
    setDocumentAnalysisDraftContent: (content) => set({ documentAnalysisDraftContent: content }),
    setDocumentAnalysisDraftStreaming: (streaming) => set({ isDocumentAnalysisDraftStreaming: streaming }),
    setDocumentAnalysisDraftComplete: (complete) => set({ isDocumentAnalysisDraftComplete: complete }),
    setDocumentAnalysisDocumentAnalyses: (analyses) => set({ documentAnalysisDocumentAnalyses: analyses }),
    setDocumentAnalysisBooksMessageId: (id) => set({ documentAnalysisBooksMessageId: id }),
    setDocumentAnalysisBooks: (books) => set({ documentAnalysisBooks: books }),
    setDocumentAnalysisSelectedBooks: (books) => set({ documentAnalysisSelectedBooks: books }),
    setDocumentAnalysisReportMessageId: (id) => set({ documentAnalysisReportMessageId: id }),
    appendDocumentAnalysisReportContent: (chunk) => set((state) => ({
        documentAnalysisReportContent: state.documentAnalysisReportContent + chunk
    })),
    setDocumentAnalysisReportContent: (content) => set({ documentAnalysisReportContent: content }),
    setDocumentAnalysisReportStreaming: (streaming) => set({ isDocumentAnalysisReportStreaming: streaming }),
    setDocumentAnalysisUserInput: (input) => set({ documentAnalysisUserInput: input }),
    resetDocumentAnalysis: () => set({ ...documentAnalysisInitialState })
}));
