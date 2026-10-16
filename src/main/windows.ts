import path from "node:path";

import { app, BrowserWindow, shell } from "electron";
import { trustMainWindow } from "./ipc/trustedSender";

function getWindowIconPath(): string {
  const extension = process.platform === "win32" ? "ico" : "png";
  return path.join(app.getAppPath(), "assets", `icon.${extension}`);
}

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1460,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#f2f2f2",
    autoHideMenuBar: true,
    icon: getWindowIconPath(),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : undefined,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => {
    window.show();
  });
  trustMainWindow(window.webContents);

  const entry = new URL(MAIN_WINDOW_WEBPACK_ENTRY);
  window.webContents.on("will-navigate", (event, target) => {
    const candidate = new URL(target);
    if (candidate.protocol !== entry.protocol || candidate.host !== entry.host || candidate.pathname !== entry.pathname) event.preventDefault();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    try { if (new URL(url).protocol === "https:") void shell.openExternal(url); } catch { /* Reject malformed external links. */ }
    return { action: "deny" };
  });

  if (!app.isPackaged) {
    window.webContents.on("did-finish-load", () => {
      void (async () => {
        try {
          const diagnostics = await window.webContents.executeJavaScript(`
            ({
              desktopApiType: typeof window.launchStack,
              bodyTextLength: document.body.innerText.trim().length,
              rootChildren: document.getElementById('root')?.childElementCount ?? -1
            })
          `);
          console.log("[renderer:diagnostics]", diagnostics);
        } catch (error) {
          console.error("[renderer:diagnostics:error]", error);
        }
      })();
    });
  }

  void window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
    window.webContents.openDevTools({ mode: "detach" });
  }

  return window;
}
