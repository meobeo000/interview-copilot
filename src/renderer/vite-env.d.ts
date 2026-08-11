/// <reference types="vite/client" />

interface Window {
  copilotWindow: {
    hide: () => Promise<void>;
    getDesktopSourceId: () => Promise<string | undefined>;
    onAnswerNow?: (callback: () => void) => () => void;
    stt?: {
      startSession: () => Promise<void>;
      sendAudioFrame: (buffer: ArrayBuffer) => void;
      stopSession: () => Promise<void>;
      getConfig: () => Promise<{ provider: string; isRealSttAvailable: boolean; mockMode: boolean }>;
      onPartial: (callback: (text: string) => void) => () => void;
      onFinal: (callback: (text: string) => void) => () => void;
      onError: (callback: (error: string) => void) => () => void;
    };
  };
}
