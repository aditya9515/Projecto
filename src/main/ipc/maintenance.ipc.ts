import { ipcMain } from "electron";

import { MaintenanceService } from "../services/maintenanceService";

export function registerMaintenanceIpc(
  maintenanceService: MaintenanceService,
): void {
  ipcMain.handle("maintenance:getStatus", async () =>
    maintenanceService.getStatus(),
  );
  ipcMain.handle("maintenance:cleanup", async () =>
    maintenanceService.runCleanup("manual"),
  );
}
