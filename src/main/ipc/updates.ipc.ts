import { ipcMain } from "electron";

import { DesktopUpdateCheckOptionsSchema } from "../types/shared";
import type { UpdateService } from "../services/updateService";

export function registerUpdatesIpc(updateService: UpdateService): void {
  ipcMain.handle("updates:getState", async () => updateService.getState());

  ipcMain.handle("updates:check", async (_event, options) => {
    return updateService.checkForUpdates(
      DesktopUpdateCheckOptionsSchema.parse(options),
    );
  });

  ipcMain.handle("updates:install", async () => updateService.installUpdate());
}
