import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { app, clipboard, dialog, ipcMain, shell } from "electron";
import { PROTOCOL_VERSION } from "projecto-protocol";
import {
  DiagnosticCheckResultSchema,
  DiagnosticsReportSchema,
  RunningPortSchema,
  type DiagnosticsReport,
  type RunningPort,
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
function isWindowsCommandScript(executable: string): boolean {
  if (process.platform !== "win32") {
    return false;
  }

  const extension = path.extname(executable).toLowerCase();
  return extension === ".cmd" || extension === ".bat";
}

async function commandStarts(
  executable: string,
  args: string[] = ["--version"],
): Promise<boolean> {
  return new Promise((resolve) => {
    const useCommandShell = isWindowsCommandScript(executable);
    const child = spawn(
      useCommandShell ? process.env.ComSpec?.trim() || "cmd.exe" : executable,
      useCommandShell ? ["/d", "/c", executable, ...args] : args,
      {
        windowsHide: true,
        stdio: "ignore",
      },
    );

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


function runOutput(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
        return;
      }

      reject(
        new Error(
          Buffer.concat(stderr).toString("utf8").trim() ||
            `${command} exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}

function parseEndpoint(endpoint: string): { host: string; port: number } | null {
  const trimmed = endpoint.trim();
  const bracketIndex = trimmed.lastIndexOf("]:");

  if (trimmed.startsWith("[") && bracketIndex !== -1) {
    const port = Number.parseInt(trimmed.slice(bracketIndex + 2), 10);
    return Number.isInteger(port)
      ? { host: trimmed.slice(1, bracketIndex), port }
      : null;
  }

  const separatorIndex = trimmed.lastIndexOf(":");
  if (separatorIndex === -1) {
    return null;
  }

  const port = Number.parseInt(trimmed.slice(separatorIndex + 1), 10);
  if (!Number.isInteger(port)) {
    return null;
  }

  return { host: trimmed.slice(0, separatorIndex), port };
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

async function getProcessNamesByPid(): Promise<Map<number, string>> {
  if (process.platform !== "win32") {
    return new Map();
  }

  try {
    const output = await runOutput("tasklist", ["/FO", "CSV", "/NH"]);
    const names = new Map<number, string>();

    for (const line of output.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }

      const [name, pidValue] = parseCsvLine(line);
      const pid = Number.parseInt(pidValue ?? "", 10);
      if (name && Number.isInteger(pid)) {
        names.set(pid, name);
      }
    }

    return names;
  } catch {
    return new Map();
  }
}

async function getRunningPorts(): Promise<RunningPort[]> {
  if (process.platform !== "win32") {
    return [];
  }

  const [output, processNames] = await Promise.all([
    runOutput("netstat", ["-ano", "-p", "tcp"]),
    getProcessNamesByPid(),
  ]);
  const ports: RunningPort[] = [];

  for (const line of output.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5 || parts[0]?.toUpperCase() !== "TCP") {
      continue;
    }

    const state = parts[3] ?? "";
    if (state.toUpperCase() !== "LISTENING") {
      continue;
    }

    const endpoint = parseEndpoint(parts[1] ?? "");
    const pid = Number.parseInt(parts[4] ?? "", 10);
    if (!endpoint || !Number.isInteger(pid)) {
      continue;
    }

    ports.push(
      RunningPortSchema.parse({
        protocol: "tcp",
        localAddress: endpoint.host,
        port: endpoint.port,
        state,
        pid,
        processName: processNames.get(pid),
      }),
    );
  }

  return ports.sort(
    (left, right) =>
      left.port - right.port ||
      left.localAddress.localeCompare(right.localAddress),
  );
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

  ipcMain.handle("diagnostics:getRunningPorts", async () => getRunningPorts());

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
