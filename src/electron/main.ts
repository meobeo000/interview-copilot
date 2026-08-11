import path from "node:path";
import { app, BrowserWindow, globalShortcut, ipcMain } from "electron";

let mainWindow: BrowserWindow | undefined;

function rendererUrl(): string {
  if (process.env.VITE_DEV_SERVER_URL) {
    return process.env.VITE_DEV_SERVER_URL;
  }

  return `file://${path.join(__dirname, "../dist/index.html")}`;
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

  ipcMain.handle("window:hide", () => {
    mainWindow?.hide();
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
});
