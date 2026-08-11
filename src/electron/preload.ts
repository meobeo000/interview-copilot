import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("copilotWindow", {
  hide: () => ipcRenderer.invoke("window:hide"),
  getDesktopSourceId: () => ipcRenderer.invoke("system-audio:get-source-id"),
  stt: {
    startSession: () => ipcRenderer.invoke("stt:start"),
    sendAudioFrame: (buffer: ArrayBuffer) => ipcRenderer.send("stt:send-audio-frame", buffer),
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
  }
});
