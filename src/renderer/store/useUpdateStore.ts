import { create } from "zustand";
import type { DesktopUpdateState } from "../../main/types/shared";

const initialUpdateState: DesktopUpdateState = {
  status: "idle",
  currentVersion: "0.0.0",
  updateAvailable: false,
};

type UpdateStore = {
  updateState: DesktopUpdateState;
  initialized: boolean;
  setUpdateState: (updateState: DesktopUpdateState) => void;
  loadUpdateState: () => Promise<DesktopUpdateState>;
  checkForUpdates: (options?: { silent?: boolean }) => Promise<DesktopUpdateState>;
  installUpdate: () => Promise<DesktopUpdateState>;
};

export const useUpdateStore = create<UpdateStore>((set) => ({
  updateState: initialUpdateState,
  initialized: false,
  setUpdateState: (updateState) => set({ updateState, initialized: true }),
  loadUpdateState: async () => {
    const updateState = await window.launchStack.updates.getState();
    set({ updateState, initialized: true });
    return updateState;
  },
  checkForUpdates: async (options) => {
    const updateState = await window.launchStack.updates.check(options);
    set({ updateState, initialized: true });
    return updateState;
  },
  installUpdate: async () => {
    const updateState = await window.launchStack.updates.install();
    set({ updateState, initialized: true });
    return updateState;
  },
}));
