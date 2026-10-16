import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { app, BrowserWindow, session } from "electron";
import squirrelStartup from "electron-squirrel-startup";

import { registerBillingIpc } from "./ipc/billing.ipc";
import { registerDiagnosticsIpc } from "./ipc/diagnostics.ipc";
import { registerInsightsIpc } from "./ipc/insights.ipc";
import { registerLauncherIpc } from "./ipc/launcher.ipc";
import { registerMaintenanceIpc } from "./ipc/maintenance.ipc";
import { registerProjectIpc } from "./ipc/project.ipc";
import { registerSettingsIpc } from "./ipc/settings.ipc";
import { registerUpdatesIpc } from "./ipc/updates.ipc";
import { createMainWindow } from "./windows";
import { ActivityStore } from "./services/activityStore";
import { CommandRunner } from "./services/commandRunner";
import { CommandSafetyService } from "./services/commandSafetyService";
import { DesktopBridgeService } from "./services/desktopBridgeService";
import { EditorService } from "./services/editorService";
import { ExternalUrlService } from "./services/externalUrlService";
import { FileSystemService } from "./services/fileSystemService";
import { LauncherService } from "./services/launcherService";
import { MaintenanceService } from "./services/maintenanceService";
import { ProjectDetector } from "./services/projectDetector";
import { ProjectScanner } from "./services/projectScanner";
import { ProjectStore } from "./services/projectStore";
import { SettingsStore } from "./services/settingsStore";
import { SubscriptionService } from "./services/subscriptionService";
import { SubscriptionStore } from "./services/subscriptionStore";
import { TerminalSessionStore } from "./services/terminalSessionStore";
import { UpdateService } from "./services/updateService";
import type { RunEvent } from "./types/shared";

if (squirrelStartup) {
  app.quit();
}

app.setName("Projecto");

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let subscriptionService: SubscriptionService | null = null;
let desktopBridgeService: DesktopBridgeService | null = null;
let launcherService: LauncherService | null = null;
let updateService: UpdateService | null = null;
let isQuitting = false;
let shutdownComplete = false;
let shutdownPromise: Promise<void> | null = null;
const pendingProtocolUrls: string[] = [];
const recentLaunchFailures: RunEvent[] = [];
const SHUTDOWN_STEP_TIMEOUT_MS = 5_000;

function logMainProcessError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.stack || error.message : error;
  console.error(`[Projecto] ${context}`, message);
}

function sendToRenderer(channel: string, payload: unknown): void {
  const window = mainWindow;

  if (
    !window ||
    window.isDestroyed() ||
    window.webContents.isDestroyed()
  ) {
    return;
  }

  try {
    window.webContents.send(channel, payload);
  } catch (error) {
    logMainProcessError(`Unable to send renderer event ${channel}.`, error);
  }
}

function withShutdownTimeout(
  label: string,
  task: () => Promise<void> | void,
): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<void>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(
        new Error(
          `${label} shutdown exceeded ${SHUTDOWN_STEP_TIMEOUT_MS}ms.`,
        ),
      );
    }, SHUTDOWN_STEP_TIMEOUT_MS);
    timeout.unref?.();
  });

  return Promise.race([
    Promise.resolve().then(task),
    timeoutPromise,
  ]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

async function runShutdownStep(
  label: string,
  task: () => Promise<void> | void,
): Promise<void> {
  try {
    await withShutdownTimeout(label, task);
  } catch (error) {
    logMainProcessError(`${label} shutdown failed.`, error);
  }
}

function shutdownServices(): Promise<void> {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    await runShutdownStep("launcher", () => launcherService?.stopAllRuns());
    await runShutdownStep("terminal compatibility", async () => {
      await desktopBridgeService?.stop();
    });
    await runShutdownStep("subscription", async () => {
      await subscriptionService?.dispose();
    });
    await runShutdownStep("updates", () => {
      updateService?.dispose();
    });
  })();

  return shutdownPromise;
}

process.on("unhandledRejection", (reason) => {
  logMainProcessError("Unhandled promise rejection.", reason);
});

process.on("uncaughtException", (error) => {
  logMainProcessError("Uncaught exception.", error);

  if (!isQuitting) {
    app.quit();
  }
});

function escapeDesktopExec(value: string): string {
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}

async function syncLinuxAutostart(enabled: boolean): Promise<void> {
  const autostartDirectory = path.join(os.homedir(), ".config", "autostart");
  const desktopFilePath = path.join(autostartDirectory, "projecto.desktop");

  if (!enabled) {
    await fs.rm(desktopFilePath, { force: true }).catch(() => undefined);
    return;
  }

  await fs.mkdir(autostartDirectory, { recursive: true });

  const execParts =
    process.defaultApp && process.argv[1]
      ? [process.execPath, path.resolve(process.argv[1])]
      : [process.execPath];
  const execLine = execParts.map((part) => escapeDesktopExec(part)).join(" ");
  const desktopFile = [
    "[Desktop Entry]",
    "Type=Application",
    "Version=1.0",
    "Name=Projecto",
    "Comment=Start Projecto when you sign in",
    `Exec=${execLine}`,
    "Terminal=false",
    "X-GNOME-Autostart-enabled=true",
  ].join("\n");

  await fs.writeFile(desktopFilePath, `${desktopFile}\n`, "utf8");
}

async function syncOpenAtLogin(enabled: boolean): Promise<void> {
  if (process.platform === "linux") {
    await syncLinuxAutostart(enabled);
    return;
  }

  const loginItemSettings =
    process.defaultApp && process.argv[1]
      ? {
          openAtLogin: enabled,
          openAsHidden: false,
          path: process.execPath,
          args: [path.resolve(process.argv[1])],
        }
      : {
          openAtLogin: enabled,
          openAsHidden: false,
        };

  app.setLoginItemSettings(loginItemSettings);
}

function findProtocolUrl(argv: string[]): string | null {
  return argv.find((value) => value.startsWith("projecto://")) ?? null;
}

function focusMainWindow(): void {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
}

async function processProtocolQueue(): Promise<void> {
  if (!subscriptionService) {
    return;
  }

  while (pendingProtocolUrls.length > 0) {
    const nextUrl = pendingProtocolUrls.shift();

    if (!nextUrl) {
      continue;
    }

    await subscriptionService.handleProtocolUrl(nextUrl);
  }
}

function queueProtocolUrl(url: string | null): void {
  if (!url) {
    return;
  }

  pendingProtocolUrls.push(url);
  void processProtocolQueue();
}

function registerProjectoProtocol(): void {
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient("projecto", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
    return;
  }

  app.setAsDefaultProtocolClient("projecto");
}

async function bootstrapIpc(
  windowGetter: () => BrowserWindow | null,
): Promise<LauncherService> {
  const userDataPath = app.getPath("userData");
  const fileSystemService = new FileSystemService();
  const maintenanceService = new MaintenanceService({
    userDataPath,
    sessionDataPath: app.getPath("sessionData"),
    appVersion: app.getVersion(),
    fileSystemService,
    clearCache: () => session.defaultSession.clearCache(),
    clearCodeCaches: () => session.defaultSession.clearCodeCaches({}),
  });
  await maintenanceService
    .runAutomaticCleanupIfNeeded()
    .catch((error) => logMainProcessError("Automatic cleanup failed", error));
  const projectDetector = new ProjectDetector();
  const projectScanner = new ProjectScanner(fileSystemService, projectDetector);
  const subscriptionStore = new SubscriptionStore(
    fileSystemService,
    userDataPath,
  );
  const settingsStore = new SettingsStore(fileSystemService, userDataPath);
  const activityStore = new ActivityStore(
    fileSystemService,
    userDataPath,
    async () => (await settingsStore.getSettings()).telemetryEnabled,
  );
  const editorService = new EditorService();
  const externalUrlService = new ExternalUrlService();
  updateService = new UpdateService({
    openExternal: async (url) => {
      await externalUrlService.openUrl(url);
    },
  });
  const commandRunner = new CommandRunner(path.join(userDataPath, "runs"));
  const commandSafetyService = new CommandSafetyService(
    fileSystemService,
    userDataPath,
  );
  const terminalSessionStore = new TerminalSessionStore(
    fileSystemService,
    userDataPath,
  );

  subscriptionService = new SubscriptionService({
    persistence: subscriptionStore,
    openExternal: async (url) => {
      await externalUrlService.openUrl(url);
    },
  });
  const projectStore = new ProjectStore(
    fileSystemService,
    subscriptionService,
    userDataPath,
  );
  desktopBridgeService = new DesktopBridgeService(
    fileSystemService,
    projectStore,
    userDataPath,
  );
  const settings = await settingsStore.getSettings();
  await syncOpenAtLogin(settings.launchOnStartup);
  void subscriptionService.initialize().catch((error) => logMainProcessError("Initial subscription verification failed", error));
  await desktopBridgeService.start();

  launcherService = new LauncherService(
    projectStore,
    settingsStore,
    editorService,
    commandRunner,
    activityStore,
    externalUrlService,
    subscriptionService,
    commandSafetyService,
    terminalSessionStore,
  );
  desktopBridgeService.setLauncherService(launcherService);

  registerProjectIpc({
    getMainWindow: windowGetter,
    projectScanner,
    projectStore,
    activityStore,
    subscriptionService,
  });
  registerLauncherIpc(launcherService, desktopBridgeService);
  registerSettingsIpc(settingsStore, async (nextSettings) => {
    await syncOpenAtLogin(nextSettings.launchOnStartup);
  });
  registerBillingIpc(subscriptionService);
  registerDiagnosticsIpc({
    settingsStore,
    subscriptionService,
    projectStore,
    desktopBridgeService,
    commandSafetyService,
    getRecentLaunchFailures: () => recentLaunchFailures.slice(0, 10),
  });
  registerInsightsIpc({
    activityStore,
    projectStore,
  });
  registerUpdatesIpc(updateService);
  registerMaintenanceIpc(maintenanceService);

  return launcherService;
}

app.on("second-instance", (_event, argv) => {
  focusMainWindow();
  queueProtocolUrl(findProtocolUrl(argv));
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  queueProtocolUrl(url);
});

app.whenReady().then(async () => {
  registerProjectoProtocol();

  const launcherService = await bootstrapIpc(() => mainWindow);
  launcherService.onRunEvent((event) => {
    sendToRenderer("launcher:run-event", event);
    desktopBridgeService?.forwardRunEvent(event);

    if (event.kind === "status" && event.status === "failed") {
      recentLaunchFailures.unshift(event);
      recentLaunchFailures.splice(10);
    }
  });
  launcherService.onTerminalSession((session) => {
    sendToRenderer("launcher:terminal-session", session);
  });
  desktopBridgeService?.onStateChange((state) => {
    sendToRenderer("launcher:bridge-state", state);
  });
  subscriptionService?.onEvent((event) => {
    sendToRenderer("billing:event", event);
  });
  updateService?.onStateChange((state) => {
    sendToRenderer("updates:state", state);
  });

  mainWindow = createMainWindow();
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  focusMainWindow();

  void updateService
    ?.checkForUpdates({ silent: true })
    .catch(() => undefined);

  queueProtocolUrl(findProtocolUrl(process.argv));
  await processProtocolQueue();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
      mainWindow.on("closed", () => {
        mainWindow = null;
      });
    }

    focusMainWindow();
  });
}).catch((error) => {
  logMainProcessError("Application startup failed.", error);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  isQuitting = true;

  if (shutdownComplete) {
    return;
  }

  event.preventDefault();
  void shutdownServices().finally(() => {
    shutdownComplete = true;
    app.quit();
  });
});
