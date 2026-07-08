import { create } from "zustand";
type UiStoreState = {
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
};
export const useUiStore = create<UiStoreState>((set) => ({
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  setSidebarCollapsed: (sidebarCollapsed) => {
    set({ sidebarCollapsed });
  },
  toggleSidebar: () => {
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
  },
  setCommandPaletteOpen: (commandPaletteOpen) => {
    set({ commandPaletteOpen });
  },
  toggleCommandPalette: () => {
    set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen }));
  },
}));
