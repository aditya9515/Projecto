import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { dialog, ipcMain } from "electron";
import { z } from "zod";

import { ExportRunLogsInputSchema } from "../types/shared";
import type { DesktopBridgeService } from "../services/desktopBridgeService";
import { LauncherService } from "../services/launcherService";

const idSchema = z.string().min(1);
const pathSchema = z.string().trim().min(1);
const urlSchema = z.string().url();
const commandApprovalOptionsSchema = z
  .object({
    approvedCommandIds: z.array(idSchema).optional(),
    dangerousOverride: z.boolean().optional(),
  })
  .optional();

export function registerLauncherIpc(
  launcherService: LauncherService,
  desktopBridgeService: DesktopBridgeService,
): void {
  ipcMain.handle("launcher:openFolder", async (_event, input) => {
    await launcherService.openFolder(pathSchema.parse(input));
  });

  ipcMain.handle("launcher:openEditor", async (_event, input) => {
    await launcherService.openEditor(idSchema.parse(input));
  });

  ipcMain.handle(
    "launcher:launchProfile",
    async (_event, projectId, profileId, options) => {
      return launcherService.launchProfile(
        idSchema.parse(projectId),
        idSchema.parse(profileId),
        commandApprovalOptionsSchema.parse(options),
      );
    },
  );

  ipcMain.handle(
    "launcher:runCommand",
    async (_event, projectId, commandId, options) => {
      return launcherService.runCommand(
        idSchema.parse(projectId),
        idSchema.parse(commandId),
        commandApprovalOptionsSchema.parse(options),
      );
    },
  );

  ipcMain.handle("launcher:openUrl", async (_event, input) => {
    await launcherService.openUrl(urlSchema.parse(input));
  });

  ipcMain.handle("launcher:stopRun", async (_event, runId) => {
    return launcherService.stopRun(idSchema.parse(runId));
  });

  ipcMain.handle("launcher:stopProjectTerminal", async (_event, projectId) => {
    return launcherService.stopProjectTerminal(idSchema.parse(projectId));
  });

  ipcMain.handle(
    "launcher:revealProjectTerminal",
    async (_event, projectId) => {
      return launcherService.revealProjectTerminal(idSchema.parse(projectId));
    },
  );

  ipcMain.handle("launcher:getTerminalSessions", async () => {
    return launcherService.getTerminalSessions();
  });

  ipcMain.handle("launcher:getBridgeState", async () =>
    desktopBridgeService.getState(),
  );

  ipcMain.handle("launcher:getCommandSafety", async (_event, projectId) => {
    return launcherService.getCommandSafety(idSchema.parse(projectId));
  });

  ipcMain.handle("launcher:exportRunLogs", async (_event, input) => {
    const payload = ExportRunLogsInputSchema.parse(input);
    const safeTitle = payload.title.replace(/[<>:"/\\|?*]+/g, "-").slice(0, 80);
    const result = await dialog.showSaveDialog({
      title: "Export Projecto run logs",
      defaultPath: path.join(os.homedir(), `${safeTitle || payload.runId}.log`),
      filters: [{ name: "Log files", extensions: ["log", "txt"] }],
    });

    if (result.canceled || !result.filePath) {
      return;
    }

    await fs.writeFile(result.filePath, payload.content, "utf8");
  });
}
