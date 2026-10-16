import { handleTrusted } from "./trustedSender";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { dialog } from "electron";
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
  handleTrusted("launcher:openFolder", async (_event, input) => {
    await launcherService.openFolder(pathSchema.parse(input));
  });

  handleTrusted("launcher:openEditor", async (_event, input) => {
    await launcherService.openEditor(idSchema.parse(input));
  });

  handleTrusted(
    "launcher:launchProfile",
    async (_event, projectId, profileId, options) => {
      return launcherService.launchProfile(
        idSchema.parse(projectId),
        idSchema.parse(profileId),
        commandApprovalOptionsSchema.parse(options),
      );
    },
  );

  handleTrusted(
    "launcher:runCommand",
    async (_event, projectId, commandId, options) => {
      return launcherService.runCommand(
        idSchema.parse(projectId),
        idSchema.parse(commandId),
        commandApprovalOptionsSchema.parse(options),
      );
    },
  );

  handleTrusted("launcher:openUrl", async (_event, input) => {
    await launcherService.openUrl(urlSchema.parse(input));
  });

  handleTrusted("launcher:stopRun", async (_event, runId) => {
    return launcherService.stopRun(idSchema.parse(runId));
  });

  handleTrusted("launcher:stopProjectTerminal", async (_event, projectId) => {
    return launcherService.stopProjectTerminal(idSchema.parse(projectId));
  });

  handleTrusted(
    "launcher:revealProjectTerminal",
    async (_event, projectId) => {
      return launcherService.revealProjectTerminal(idSchema.parse(projectId));
    },
  );

  handleTrusted("launcher:getTerminalSessions", async () => {
    return launcherService.getTerminalSessions();
  });

  handleTrusted("launcher:getBridgeState", async () =>
    desktopBridgeService.getState(),
  );

  handleTrusted("launcher:getCommandSafety", async (_event, projectId) => {
    return launcherService.getCommandSafety(idSchema.parse(projectId));
  });

  handleTrusted("launcher:exportRunLogs", async (_event, input) => {
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
