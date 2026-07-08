import { ipcMain } from "electron";

import type { AppSettings } from "../types/shared";
import { AppSettingsUpdateSchema } from "../types/shared";
import { SettingsStore } from "../services/settingsStore";

export function registerSettingsIpc(
  settingsStore: SettingsStore,
  onSettingsUpdated?: (settings: AppSettings) => Promise<void> | void,
): void {
  ipcMain.handle("settings:getSettings", async () => {
    return settingsStore.getSettings();
  });

  ipcMain.handle("settings:updateSettings", async (_event, patch) => {
    const payload = AppSettingsUpdateSchema.parse(patch);
    const settings = await settingsStore.updateSettings(payload);
    await onSettingsUpdated?.(settings);
    return settings;
  });
}
