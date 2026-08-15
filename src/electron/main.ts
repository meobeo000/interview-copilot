import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain } from "electron";
import { AnswerMainService } from "./answerMainService";
import { bootstrapEnv } from "./envBootstrap";
import { SttMainService } from "./sttMainService";

bootstrapEnv();

const provider = (process.env.ANSWER_PROVIDER || "gemini").trim();
const model = (process.env.GEMINI_ANSWER_MODEL || "gemini-3.1-flash-lite").trim();
const apiKey = (process.env.GEMINI_API_KEY || "").trim();
console.log(`[ANSWER PROVIDER]\nprovider=${provider}\nmodel=${model}\napiKey=${apiKey ? "configured" : "missing"}\nstatus=ready`);

let mainWindow: BrowserWindow | undefined;
const sttMainService = new SttMainService();
const answerMainService = new AnswerMainService();

function rendererUrl(): string {
  if (process.env.VITE_DEV_SERVER_URL) {
    return process.env.VITE_DEV_SERVER_URL;
  }

  return pathToFileURL(path.join(__dirname, "../../dist/index.html")).href;
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
  mainWindow.setContentProtection(true);

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[RENDERER ${level}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on("did-fail-load", () => {
    if (process.env.VITE_DEV_SERVER_URL) {
      setTimeout(() => {
        void mainWindow?.loadURL(rendererUrl());
      }, 500);
    }
  });

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

  ipcMain.handle("window:set-content-protection", (_event, enabled: boolean) => {
    mainWindow?.setContentProtection(enabled);
    return enabled;
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

  ipcMain.on("stt:send-audio-frame", (_event, buffer: ArrayBuffer, capturedAt?: number) => {
    sttMainService.sendAudioFrame(buffer, capturedAt);
  });

  ipcMain.handle("stt:stop", async () => {
    await sttMainService.stopSession();
  });

  ipcMain.handle("stt:get-config", () => sttMainService.getConfig());

  ipcMain.handle("answer:generate", async (_event, request: { questionId: string; question: string; rawTranscript: string }) => {
    if (mainWindow) {
      await answerMainService.generateAnswer(mainWindow, request);
    }
  });

  ipcMain.handle("answer:cancel", (_event, questionId?: string) => {
    answerMainService.cancelAnswer(questionId);
  });

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
