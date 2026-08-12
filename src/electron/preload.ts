import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("copilotWindow", {
  hide: () => ipcRenderer.invoke("window:hide"),
  getDesktopSourceId: () => ipcRenderer.invoke("system-audio:get-source-id"),
  onAnswerNow: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("shortcut:answer-now", listener);
    return () => ipcRenderer.removeListener("shortcut:answer-now", listener);
  },
  stt: {
    startSession: () => ipcRenderer.invoke("stt:start"),
    sendAudioFrame: (buffer: ArrayBuffer, capturedAt: number) => ipcRenderer.send("stt:send-audio-frame", buffer, capturedAt),
    stopSession: () => ipcRenderer.invoke("stt:stop"),
    getConfig: () => ipcRenderer.invoke("stt:get-config"),
    onPartial: (callback: (text: string) => void) => {
      const listener = (_event: unknown, text: string) => callback(text);
      ipcRenderer.on("stt:partial", listener);
      return () => ipcRenderer.removeListener("stt:partial", listener);
    },
    onFinal: (callback: (text: string) => void) => {
      const listener = (_event: unknown, text: string) => callback(text);
      ipcRenderer.on("stt:final", listener);
      return () => ipcRenderer.removeListener("stt:final", listener);
    },
    onError: (callback: (error: string) => void) => {
      const listener = (_event: unknown, error: string) => callback(error);
      ipcRenderer.on("stt:error", listener);
      return () => ipcRenderer.removeListener("stt:error", listener);
    }
  },
  answer: {
    generateAnswer: (request: { questionId: string; question: string; rawTranscript: string }) =>
      ipcRenderer.invoke("answer:generate", request),
    cancelAnswer: (questionId?: string) => ipcRenderer.invoke("answer:cancel", questionId),
    onChunk: (callback: (payload: { questionId: string; deltaText: string; accumulatedText: string }) => void) => {
      const listener = (_event: unknown, payload: { questionId: string; deltaText: string; accumulatedText: string }) => callback(payload);
      ipcRenderer.on("answer:chunk", listener);
      return () => ipcRenderer.removeListener("answer:chunk", listener);
    },
    onComplete: (callback: (payload: { questionId: string; answer: unknown }) => void) => {
      const listener = (_event: unknown, payload: { questionId: string; answer: unknown }) => callback(payload);
      ipcRenderer.on("answer:complete", listener);
      return () => ipcRenderer.removeListener("answer:complete", listener);
    },
    onError: (callback: (payload: { questionId: string; error: string }) => void) => {
      const listener = (_event: unknown, payload: { questionId: string; error: string }) => callback(payload);
      ipcRenderer.on("answer:error", listener);
      return () => ipcRenderer.removeListener("answer:error", listener);
    }
  }
});
