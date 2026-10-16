import { handleTrusted } from "./trustedSender";


import { MaintenanceService } from "../services/maintenanceService";

export function registerMaintenanceIpc(
  maintenanceService: MaintenanceService,
): void {
  handleTrusted("maintenance:getStatus", async () =>
    maintenanceService.getStatus(),
  );
  handleTrusted("maintenance:cleanup", async () =>
    maintenanceService.runCleanup("manual"),
  );
}
