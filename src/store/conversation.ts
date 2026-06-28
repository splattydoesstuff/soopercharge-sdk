import { create } from "zustand";
import { ChatMessage, SessionSummary } from "../core/context-service";
import { sessionService } from "../server-api/client";

export type { ChatMessage, SessionSummary };

export type NewChatMessage = Omit<ChatMessage, "id" | "timestamp"> & {
  id?: string;
  timestamp?: string;
};

interface ConversationState {
  activeSessionId: string | null;
  messages: ChatMessage[];
  isProcessing: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  currentTranscript: string;
  streamingText: string;
  overlayVisible: boolean;
  imageOverlayUri: string | null;

  // Actions
  setActiveSession: (sessionId: string, messages?: ChatMessage[]) => void;
  addMessage: (message: NewChatMessage) => ChatMessage;
  appendMessage: (message: NewChatMessage) => Promise<ChatMessage>;
  setProcessing: (processing: boolean) => void;
  setListening: (listening: boolean) => void;
  setSpeaking: (speaking: boolean) => void;
  setCurrentTranscript: (transcript: string) => void;
  setStreamingText: (text: string) => void;
  appendStreamingText: (text: string) => void;
  setOverlayVisible: (visible: boolean) => void;
  showImageOverlay: (uri: string | null) => void;
  hideImageOverlay: () => void;
  clearMessages: () => void;
  clearSession: () => void;
}

function createLocalMessage(message: NewChatMessage): ChatMessage {
  return {
    ...message,
    id: message.id ?? `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: message.timestamp ?? new Date().toISOString(),
  };
}

export const useConversationStore = create<ConversationState>((set) => ({
  activeSessionId: null,
  messages: [],
  isProcessing: false,
  isListening: false,
  isSpeaking: false,
  currentTranscript: "",
  streamingText: "",
  overlayVisible: false,
  imageOverlayUri: null,

  setActiveSession: (activeSessionId, messages) =>
    set(messages ? { activeSessionId, messages } : { activeSessionId }),

  addMessage: (message) => {
    const localMessage = createLocalMessage(message);
    set((state) => ({
      messages: [...state.messages, localMessage],
      imageOverlayUri: localMessage.evidenceUri ?? state.imageOverlayUri,
      overlayVisible: true,
    }));
    return localMessage;
  },

  appendMessage: async (message) => {
    const localMessage = createLocalMessage(message);
    set((state) => ({
      messages: [...state.messages, localMessage],
      imageOverlayUri: localMessage.evidenceUri ?? state.imageOverlayUri,
      overlayVisible: true,
    }));

    const sessionId = useConversationStore.getState().activeSessionId;
    if (sessionId) {
      try {
        await sessionService.addMessage(sessionId, {
          role: localMessage.role,
          content: localMessage.content,
          evidenceUri: localMessage.evidenceUri,
        });
      } catch (error) {
        console.warn("[ConversationStore] Failed to persist session message:", error);
      }
    }

    return localMessage;
  },

  setProcessing: (isProcessing) => set({ isProcessing }),
  setListening: (isListening) =>
    set((state) => ({
      isListening,
      overlayVisible: isListening ? true : state.overlayVisible,
    })),
  setSpeaking: (isSpeaking) =>
    set((state) => ({
      isSpeaking,
      overlayVisible: isSpeaking ? true : state.overlayVisible,
    })),
  setCurrentTranscript: (currentTranscript) =>
    set((state) => ({
      currentTranscript,
      overlayVisible: currentTranscript ? true : state.overlayVisible,
    })),
  setStreamingText: (streamingText) =>
    set((state) => ({
      streamingText,
      overlayVisible: streamingText ? true : state.overlayVisible,
    })),
  appendStreamingText: (text) =>
    set((state) => ({
      streamingText: `${state.streamingText}${text}`,
      overlayVisible: true,
    })),
  setOverlayVisible: (overlayVisible) => set({ overlayVisible }),
  showImageOverlay: (imageOverlayUri) => set({ imageOverlayUri }),
  hideImageOverlay: () => set({ imageOverlayUri: null }),
  clearMessages: () => set({ messages: [] }),
  clearSession: () =>
    set({
      activeSessionId: null,
      messages: [],
      currentTranscript: "",
      streamingText: "",
      overlayVisible: false,
      imageOverlayUri: null,
    }),
}));
