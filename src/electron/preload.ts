import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("copilotWindow", {
  hide: () => ipcRenderer.invoke("window:hide")
});
