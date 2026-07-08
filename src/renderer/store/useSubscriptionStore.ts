import { create } from "zustand";
import {
  DEFAULT_SUBSCRIPTION_STATE,
  type BillingEvent,
  type SubscriptionState,
} from "../../main/types/shared";
import type { UpgradeReason } from "../../billing/upgradeGate";
type SubscriptionStoreState = {
  subscription: SubscriptionState;
  initialized: boolean;
  loading: boolean;
  latestEvent: BillingEvent | null;
  upgradeReason: UpgradeReason | null;
  loadSubscription: () => Promise<SubscriptionState>;
  openUpgradePage: () => Promise<void>;
  startGoogleSignIn: () => Promise<void>;
  refreshSubscription: () => Promise<SubscriptionState>;
  applyBillingEvent: (event: BillingEvent) => void;
  openUpgradeModal: (reason: UpgradeReason) => void;
  closeUpgradeModal: () => void;
};
export const useSubscriptionStore = create<SubscriptionStoreState>((set) => ({
  subscription: DEFAULT_SUBSCRIPTION_STATE,
  initialized: false,
  loading: false,
  latestEvent: null,
  upgradeReason: null,
  loadSubscription: async () => {
    set({ loading: true });
    try {
      const subscription =
        await window.launchStack.billing.getSubscriptionState();
      set({ subscription, initialized: true, loading: false });
      return subscription;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
  openUpgradePage: async () => {
    set({ loading: true });
    try {
      await window.launchStack.billing.openUpgradePage();
      set({ loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
  startGoogleSignIn: async () => {
    set({ loading: true });
    try {
      await window.launchStack.billing.startGoogleSignIn();
      set({ loading: false });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
  refreshSubscription: async () => {
    set({ loading: true });
    try {
      const subscription =
        await window.launchStack.billing.refreshSubscription();
      set({ subscription, initialized: true, loading: false });
      return subscription;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
  applyBillingEvent: (event) => {
    set((state) => ({
      latestEvent: event,
      subscription: event.subscription ?? state.subscription,
      initialized: true,
      loading: false,
    }));
  },
  openUpgradeModal: (reason) => {
    set({ upgradeReason: reason });
  },
  closeUpgradeModal: () => {
    set({ upgradeReason: null });
  },
}));
