import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { app, clipboard, dialog, ipcMain, shell } from "electron";
import { PROTOCOL_VERSION } from "projecto-protocol";

import {
  DiagnosticCheckResultSchema,
  DiagnosticsReportSchema,
  type DiagnosticsReport,
  type RunEvent,
} from "../types/shared";
import { CommandSafetyService } from "../services/commandSafetyService";
import { DesktopBridgeService } from "../services/desktopBridgeService";
import { ProjectStore } from "../services/projectStore";
import { SettingsStore } from "../services/settingsStore";
import { SubscriptionService } from "../services/subscriptionService";

type RegisterDiagnosticsIpcOptions = {
  settingsStore: SettingsStore;
  subscriptionService: SubscriptionService;
  projectStore: ProjectStore;
  desktopBridgeService: DesktopBridgeService;
  commandSafetyService: CommandSafetyService;
  getRecentLaunchFailures: () => RunEvent[];
};

function resolveEditorCommand(): string {
  return process.platform === "win32" ? "code.cmd" : "code";
}

async function commandStarts(
  executable: string,
  args: string[] = ["--version"],
): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      shell: process.platform === "win32",
      windowsHide: true,
      stdio: "ignore",
    });

    const timeout = setTimeout(() => {
      child.kill();
      resolve(true);
    }, 2500);

    child.once("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });
    child.once("spawn", () => {
      clearTimeout(timeout);
      child.kill();
      resolve(true);
    });
  });
}

function stringifyReport(report: DiagnosticsReport): string {
  return JSON.stringify(report, null, 2);
}

export function registerDiagnosticsIpc({
  settingsStore,
  subscriptionService,
  projectStore,
  desktopBridgeService,
  commandSafetyService,
  getRecentLaunchFailures,
}: RegisterDiagnosticsIpcOptions): void {
  async function buildReport(): Promise<DiagnosticsReport> {
    const [settings, subscription, projects] = await Promise.all([
      settingsStore.getSettings(),
      subscriptionService.getSubscriptionState(),
      projectStore.getProjects().catch(() => []),
    ]);

    return DiagnosticsReportSchema.parse({
      generatedAt: new Date().toISOString(),
      appName: app.getName(),
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      userDataPath: app.getPath("userData"),
      protocolVersion: PROTOCOL_VERSION,
      bridge: desktopBridgeService.getState(),
      settings,
      subscription: {
        ...subscription,
        customerId: subscription.customerId
          ? `${subscription.customerId.slice(0, 4)}...`
          : undefined,
      },
      projectCount: projects.length,
      recentLaunchFailures: getRecentLaunchFailures(),
      notes: [
        "Command output is not included in diagnostics reports.",
        "No source files, payment secrets, Firebase secrets, or desktop session tokens are included.",
      ],
    });
  }

  ipcMain.handle("diagnostics:getReport", async () => buildReport());

  ipcMain.handle("diagnostics:copyReport", async () => {
    clipboard.writeText(stringifyReport(await buildReport()));
  });

  ipcMain.handle("diagnostics:exportReport", async () => {
    const report = await buildReport();
    const result = await dialog.showSaveDialog({
      title: "Export Projecto diagnostics",
      defaultPath: path.join(
        os.homedir(),
        `projecto-diagnostics-${Date.now()}.json`,
      ),
      filters: [{ name: "JSON", extensions: ["json"] }],
    });

    if (result.canceled || !result.filePath) {
      return;
    }

    await fs.writeFile(result.filePath, stringifyReport(report), "utf8");
  });

  ipcMain.handle("diagnostics:openAppDataFolder", async () => {
    const result = await shell.openPath(app.getPath("userData"));

    if (result) {
      throw new Error(result);
    }
  });

  ipcMain.handle("diagnostics:testEditor", async () => {
    await settingsStore.getSettings();
    const command = resolveEditorCommand();
    const ok = await commandStarts(command);
    return DiagnosticCheckResultSchema.parse({
      ok,
      label: "Editor",
      message: ok
        ? `VS Code command ${command} is available.`
        : `${command} could not be started. Install VS Code and make sure the code command is available on PATH.`,
    });
  });

  ipcMain.handle("diagnostics:testTerminal", async () => {
    const command =
      process.platform === "win32"
        ? process.env.ComSpec?.trim() || "cmd.exe"
        : "sh";
    const ok = await commandStarts(
      command,
      process.platform === "win32" ? ["/d", "/c", "ver"] : ["--version"],
    );

    return DiagnosticCheckResultSchema.parse({
      ok,
      label: "Terminal",
      message: ok
        ? `${command} is available.`
        : `${command} could not be started.`,
    });
  });

  ipcMain.handle("diagnostics:resetCommandApprovals", async () => {
    await commandSafetyService.resetApprovals();
  });
}
