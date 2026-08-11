import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("copilotWindow", {
  hide: () => ipcRenderer.invoke("window:hide"),
  getDesktopSourceId: () => ipcRenderer.invoke("system-audio:get-source-id")
});
