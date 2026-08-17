/// <reference types="vite/client" />

interface Window {
  copilotWindow: {
    hide: () => Promise<void>;
    setContentProtection?: (enabled: boolean) => Promise<boolean>;
    getDesktopSourceId: () => Promise<string | undefined>;
    onAnswerNow?: (callback: () => void) => () => void;
    stt?: {
      startSession: () => Promise<void>;
      sendAudioFrame: (buffer: ArrayBuffer, capturedAt: number) => void;
      stopSession: () => Promise<void>;
      getConfig: () => Promise<{ provider: string; isRealSttAvailable: boolean; mockMode: boolean }>;
      onPartial: (callback: (text: string) => void) => () => void;
      onFinal: (callback: (text: string) => void) => () => void;
      onSpeechFinal?: (callback: (text?: string) => void) => () => void;
      onError: (callback: (error: string) => void) => () => void;
    };
    answer?: {
      generateAnswer: (request: { questionId: string; question: string; rawTranscript: string }) => Promise<void>;
      cancelAnswer: (questionId?: string) => Promise<void>;
      onChunk: (callback: (payload: { questionId: string; accumulatedText: string }) => void) => () => void;
      onComplete: (callback: (payload: { questionId: string; answer: unknown }) => void) => () => void;
      onError: (callback: (payload: { questionId: string; error: string }) => void) => () => void;
    };
  };
}
