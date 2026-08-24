import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, shell } from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_URL = "http://127.0.0.1:5173";
const useDevServer = process.argv.includes("--dev");

function resolveAppIcon() {
  const candidates = [
    path.join(__dirname, "../dist/icon.png"),
    path.join(__dirname, "../public/icon.png"),
  ];
  return candidates.find((p) => existsSync(p));
}

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createWindow() {
  const icon = resolveAppIcon();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 1024,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: "LuckyGain",
    backgroundColor: "#f7f3ea",
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (useDevServer) {
    void mainWindow.loadURL(DEV_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  if (process.env.ELECTRON_OPEN_DEVTOOLS === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
