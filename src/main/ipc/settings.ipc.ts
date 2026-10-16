import { handleTrusted } from "./trustedSender";


import type { AppSettings } from "../types/shared";
import { AppSettingsUpdateSchema } from "../types/shared";
import { SettingsStore } from "../services/settingsStore";

export function registerSettingsIpc(
  settingsStore: SettingsStore,
  onSettingsUpdated?: (settings: AppSettings) => Promise<void> | void,
): void {
  handleTrusted("settings:getSettings", async () => {
    return settingsStore.getSettings();
  });

  handleTrusted("settings:updateSettings", async (_event, patch) => {
    const payload = AppSettingsUpdateSchema.parse(patch);
    const settings = await settingsStore.updateSettings(payload);
    await onSettingsUpdated?.(settings);
    return settings;
  });
}
