import { handleTrusted } from "./trustedSender";


import { DesktopUpdateCheckOptionsSchema } from "../types/shared";
import type { UpdateService } from "../services/updateService";

export function registerUpdatesIpc(updateService: UpdateService): void {
  handleTrusted("updates:getState", async () => updateService.getState());

  handleTrusted("updates:check", async (_event, options) => {
    return updateService.checkForUpdates(
      DesktopUpdateCheckOptionsSchema.parse(options),
    );
  });

  handleTrusted("updates:install", async () => updateService.installUpdate());
}
