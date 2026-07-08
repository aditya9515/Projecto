import { create } from "zustand";
import type { UsageStats } from "../../main/types/shared";
const emptyUsageStats: UsageStats = { launchesToday: 0, recentActivity: [] };
type InsightsStoreState = {
  stats: UsageStats;
  loading: boolean;
  initialized: boolean;
  loadUsageStats: () => Promise<UsageStats>;
  resetUsageStats: () => void;
};
export const useInsightsStore = create<InsightsStoreState>((set) => ({
  stats: emptyUsageStats,
  loading: false,
  initialized: false,
  loadUsageStats: async () => {
    set({ loading: true });
    try {
      const stats = await window.launchStack.insights.getUsageStats();
      set({ stats, loading: false, initialized: true });
      return stats;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
  resetUsageStats: () => {
    set({ stats: emptyUsageStats, loading: false, initialized: false });
  },
}));
