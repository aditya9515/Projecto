import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isProPlan } from "../../billing/upgradeGate";
import { useAppStatusStore } from "../store/useAppStatusStore";
import { useInsightsStore } from "../store/useInsightsStore";
import { useLogsStore } from "../store/useLogsStore";
import { useProjectsStore } from "../store/useProjectsStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { useSubscriptionStore } from "../store/useSubscriptionStore";
import { useToastStore } from "../store/useToastStore";
import { useUiStore } from "../store/useUiStore";
import { useUpdateStore } from "../store/useUpdateStore";
import { getFriendlyErrorMessage } from "../utils/errors";

let freeLaunchPromptShown = false;

export function useAppBootstrap(): void {
  const navigate = useNavigate();
  const pushEvent = useLogsStore((state) => state.pushEvent);
  const pushToast = useToastStore((state) => state.pushToast);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const settings = useSettingsStore((state) => state.settings);
  const settingsInitialized = useSettingsStore((state) => state.initialized);
  const projects = useProjectsStore((state) => state.projects);
  const projectsInitialized = useProjectsStore((state) => state.initialized);
  const loadProjects = useProjectsStore((state) => state.loadProjects);
  const resetProjects = useProjectsStore((state) => state.resetProjects);
  const loadUsageStats = useInsightsStore((state) => state.loadUsageStats);
  const resetUsageStats = useInsightsStore((state) => state.resetUsageStats);
  const loadSubscription = useSubscriptionStore(
    (state) => state.loadSubscription,
  );
  const subscription = useSubscriptionStore((state) => state.subscription);
  const subscriptionInitialized = useSubscriptionStore(
    (state) => state.initialized,
  );
  const applyBillingEvent = useSubscriptionStore(
    (state) => state.applyBillingEvent,
  );
  const closeUpgradeModal = useSubscriptionStore(
    (state) => state.closeUpgradeModal,
  );
  const openUpgradeModal = useSubscriptionStore(
    (state) => state.openUpgradeModal,
  );
  const setCommandPaletteOpen = useUiStore(
    (state) => state.setCommandPaletteOpen,
  );
  const setOnline = useAppStatusStore((state) => state.setOnline);
  const setUpdateState = useUpdateStore((state) => state.setUpdateState);
  const loadUpdateState = useUpdateStore((state) => state.loadUpdateState);
  const checkForUpdates = useUpdateStore((state) => state.checkForUpdates);
  const setBridgeState = useAppStatusStore((state) => state.setBridgeState);
  const setTerminalSessions = useAppStatusStore(
    (state) => state.setTerminalSessions,
  );
  const upsertTerminalSession = useAppStatusStore(
    (state) => state.upsertTerminalSession,
  );
  const markSynced = useAppStatusStore((state) => state.markSynced);
  const setSyncError = useAppStatusStore((state) => state.setSyncError);
  const setBillingEvent = useAppStatusStore((state) => state.setBillingEvent);
  const pushLaunchFailure = useAppStatusStore(
    (state) => state.pushLaunchFailure,
  );
  const online = useAppStatusStore((state) => state.online);
  useEffect(() => {
    if (!settingsInitialized) {
      void loadSettings();
    }
  }, [loadSettings, settingsInitialized]);
  useEffect(() => {
    void loadUpdateState()
      .then((state) => {
        if (state.status === "idle" || state.status === "unavailable") {
          return checkForUpdates({ silent: true }).catch(() => undefined);
        }
        return state;
      })
      .catch(() => undefined);
    return window.launchStack.updates.onState((state) => {
      setUpdateState(state);
      if (state.status === "available" && state.updateAvailable) {
        pushToast({
          title: "Projecto update available",
          description:
            state.message ??
            `Projecto ${state.latestVersion ?? ""} is ready to install.`,
          tone: "success",
        });
      }
      if (state.status === "error") {
        pushToast({
          title: "Projecto update failed",
          description: state.error ?? state.message,
          tone: "error",
        });
      }
    });
  }, [checkForUpdates, loadUpdateState, pushToast, setUpdateState]);
  useEffect(() => {
    if (!subscriptionInitialized) {
      void loadSubscription()
        .then(() => markSynced())
        .catch((error) => {
          const message = getFriendlyErrorMessage(error, "Projecto could not restore your desktop session.");
          setSyncError(message);
          pushToast({
            title: "Unable to restore desktop session",
            description: message,
            tone: "error",
          });
        });
    }
  }, [
    loadSubscription,
    markSynced,
    pushToast,
    setSyncError,
    subscriptionInitialized,
  ]);
  useEffect(() => {
    if (subscriptionInitialized && subscription.email && !projectsInitialized) {
      void loadProjects()
        .then(() => markSynced())
        .catch((error) => {
          const message = getFriendlyErrorMessage(error, "Projecto could not load synced projects.");
          setSyncError(message);
          pushToast({
            title: "Unable to load synced projects",
            description: message,
            tone: "error",
          });
        });
    }
  }, [
    loadProjects,
    markSynced,
    projectsInitialized,
    pushToast,
    setSyncError,
    subscription.email,
    subscriptionInitialized,
  ]);
  useEffect(() => {
    if (settingsInitialized && projectsInitialized) {
      void loadUsageStats();
    }
  }, [
    loadUsageStats,
    projectsInitialized,
    projects.length,
    settingsInitialized,
  ]);
  useEffect(() => {
    if (!subscriptionInitialized) {
      return;
    }
    if (!subscription.email) {
      resetProjects();
      resetUsageStats();
    }
  }, [
    resetProjects,
    resetUsageStats,
    subscription.email,
    subscriptionInitialized,
  ]);
  useEffect(() => {
    if (
      freeLaunchPromptShown ||
      !online ||
      !settingsInitialized ||
      !subscriptionInitialized ||
      !subscription.email ||
      !settings.hasCompletedOnboarding ||
      isProPlan(subscription)
    ) {
      return;
    }
    freeLaunchPromptShown = true;
    openUpgradeModal("freeLaunch");
  }, [
    online,
    openUpgradeModal,
    settings.hasCompletedOnboarding,
    settingsInitialized,
    subscription,
    subscription.email,
    subscriptionInitialized,
  ]);
  useEffect(() => {
    function handleOnlineState(): void {
      setOnline(navigator.onLine);
    }
    handleOnlineState();
    window.addEventListener("online", handleOnlineState);
    window.addEventListener("offline", handleOnlineState);
    return () => {
      window.removeEventListener("online", handleOnlineState);
      window.removeEventListener("offline", handleOnlineState);
    };
  }, [setOnline]);
  useEffect(() => {
    void window.launchStack.launcher
      .getBridgeState()
      .then(setBridgeState)
      .catch(() => undefined);
    return window.launchStack.launcher.onBridgeState(setBridgeState);
  }, [setBridgeState]);
  useEffect(() => {
    void window.launchStack.launcher
      .getTerminalSessions()
      .then(setTerminalSessions)
      .catch(() => undefined);
    return window.launchStack.launcher.onTerminalSession(upsertTerminalSession);
  }, [setTerminalSessions, upsertTerminalSession]);
  useEffect(() => {
    return window.launchStack.launcher.onRunEvent((event) => {
      pushEvent(event);
      if (
        event.kind === "status" &&
        (event.status === "started" ||
          event.status === "completed" ||
          event.status === "failed" ||
          event.status === "stopped")
      ) {
        void loadUsageStats();
      }
      if (event.kind === "status" && event.status === "failed") {
        pushLaunchFailure(event);
        pushToast({
          title: "Command failed",
          description: event.message,
          tone: "error",
        });
      }
    });
  }, [loadUsageStats, pushEvent, pushLaunchFailure, pushToast]);
  useEffect(() => {
    return window.launchStack.billing.onBillingEvent((event) => {
      applyBillingEvent(event);
      setBillingEvent(event);
      if (event.subscription?.status === "active") {
        closeUpgradeModal();
      }
      if (
        event.type === "auth-completed" ||
        event.type === "subscription-updated"
      ) {
        void loadProjects()
          .then(() => markSynced())
          .catch(() => undefined);
      }
      if (event.message && !event.silent) {
        pushToast({
          title:
            event.type === "auth-failed" ||
            event.type === "subscription-refresh-failed"
              ? "Subscription needs attention"
              : event.type === "auth-completed"
                ? "Desktop sign-in complete"
                : event.type === "upgrade-opened"
                  ? "Opened billing in browser"
                  : "Subscription updated",
          description: event.message,
          tone:
            event.type === "auth-failed" ||
            event.type === "subscription-refresh-failed"
              ? "error"
              : event.type === "upgrade-opened" || event.type === "auth-started"
                ? "info"
                : "success",
        });
      }
    });
  }, [
    applyBillingEvent,
    closeUpgradeModal,
    loadProjects,
    markSynced,
    pushToast,
    setBillingEvent,
  ]);
  useEffect(() => {
    function handleKeydown(event: KeyboardEvent): void {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      if (modifier && event.key === ",") {
        event.preventDefault();
        navigate("/settings");
        return;
      }
      if (modifier && event.shiftKey && event.key.toLowerCase() === "u") {
        event.preventDefault();
        openUpgradeModal("projects");
        navigate("/settings");
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [navigate, openUpgradeModal, setCommandPaletteOpen]);
}
