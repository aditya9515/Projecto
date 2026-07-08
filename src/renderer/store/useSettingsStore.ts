import { create } from "zustand";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type AppSettingsUpdate,
} from "../../main/types/shared";
type SettingsState = {
  settings: AppSettings;
  initialized: boolean;
  loading: boolean;
  loadSettings: () => Promise<AppSettings>;
  updateSettings: (patch: AppSettingsUpdate) => Promise<AppSettings>;
};
export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  initialized: false,
  loading: false,
  loadSettings: async () => {
    set({ loading: true });
    try {
      const settings = await window.launchStack.settings.getSettings();
      set({ settings, initialized: true, loading: false });
      return settings;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
  updateSettings: async (patch) => {
    set({ loading: true });
    try {
      const settings = await window.launchStack.settings.updateSettings(patch);
      set({ settings, initialized: true, loading: false });
      return settings;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
}));
