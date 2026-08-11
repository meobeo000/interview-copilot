import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain } from "electron";
import { SttMainService } from "./sttMainService";

function loadEnvFile() {
  const envPath = path.join(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const parts = trimmed.split("=");
        const key = parts[0]?.trim();
        const value = parts.slice(1).join("=").trim();
        if (key && !process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
}

loadEnvFile();

let mainWindow: BrowserWindow | undefined;
const sttMainService = new SttMainService();

function rendererUrl(): string {
  if (process.env.VITE_DEV_SERVER_URL) {
    return process.env.VITE_DEV_SERVER_URL;
  }

  return pathToFileURL(path.join(__dirname, "../dist/index.html")).href;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 540,
    height: 720,
    minWidth: 420,
    minHeight: 520,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: "#101418",
    title: "Interview Copilot",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  void mainWindow.loadURL(rendererUrl());

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    mainWindow?.focus();
    if (process.env.ELECTRON_SMOKE === "1") {
      setTimeout(() => app.quit(), 500);
    }
  });
}

function toggleOverlay() {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

app.whenReady().then(() => {
  createWindow();

  if (process.env.ELECTRON_SMOKE === "1") {
    setTimeout(() => app.exit(0), 3_000);
  }

  const registered = globalShortcut.register("Alt+Space", toggleOverlay);
  if (!registered) {
    console.warn("Alt+Space global shortcut could not be registered.");
  }

  globalShortcut.register("Alt+Enter", () => {
    mainWindow?.webContents.send("shortcut:answer-now");
  });

  ipcMain.handle("window:hide", () => {
    mainWindow?.hide();
  });

  ipcMain.handle("system-audio:get-source-id", async () => {
    const sources = await desktopCapturer.getSources({ types: ["screen"] });
    return sources[0]?.id;
  });

  ipcMain.handle("stt:start", async () => {
    if (mainWindow) {
      await sttMainService.startSession(mainWindow);
    }
  });

  ipcMain.on("stt:send-audio-frame", (_event, buffer: ArrayBuffer) => {
    sttMainService.sendAudioFrame(buffer);
  });

  ipcMain.handle("stt:stop", async () => {
    await sttMainService.stopSession();
  });

  ipcMain.handle("stt:get-config", () => sttMainService.getConfig());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  void sttMainService.stopSession();
});
