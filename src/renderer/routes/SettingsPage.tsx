import { useEffect, useState } from "react";
import { parseUpgradeReason } from "../../billing/upgradeGate";
import type { AppSettingsUpdate } from "../../main/types/shared";
import { AccountBillingSettings } from "../components/settings/AccountBillingSettings";
import { SettingsForm } from "../components/settings/SettingsForm";
import { useAppStatusStore } from "../store/useAppStatusStore";
import { useProjectsStore } from "../store/useProjectsStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { useSubscriptionStore } from "../store/useSubscriptionStore";
import { useToastStore } from "../store/useToastStore";
import { getFriendlyErrorMessage } from "../utils/errors";

type SaveStatus = "idle" | "saving" | "saved" | "failed";

export function SettingsPage(): JSX.Element {
  const settings = useSettingsStore((state) => state.settings);
  const initialized = useSettingsStore((state) => state.initialized);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const subscription = useSubscriptionStore((state) => state.subscription);
  const subscriptionLoading = useSubscriptionStore((state) => state.loading);
  const startGoogleSignIn = useSubscriptionStore(
    (state) => state.startGoogleSignIn,
  );
  const refreshSubscription = useSubscriptionStore(
    (state) => state.refreshSubscription,
  );
  const openUpgradePage = useSubscriptionStore(
    (state) => state.openUpgradePage,
  );
  const online = useAppStatusStore((state) => state.online);
  const projects = useProjectsStore((state) => state.projects);
  const pushToast = useToastStore((state) => state.pushToast);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!initialized) {
      void loadSettings();
    }
  }, [initialized, loadSettings]);

  async function handleSettingsChange(patch: AppSettingsUpdate): Promise<void> {
    setSaveStatus("saving");
    setSaveMessage("Saving...");
    try {
      await updateSettings(patch);
      setSaveStatus("saved");
      setSaveMessage("Saved");
    } catch (error) {
      const upgradeReason = parseUpgradeReason(error);
      setSaveStatus("failed");
      setSaveMessage(upgradeReason ? "Upgrade required" : "Failed to save");
      pushToast({
        title: upgradeReason ? "Upgrade required" : "Unable to save settings",
        description: getFriendlyErrorMessage(
          error,
          "Projecto could not save this setting. Refresh and try again.",
        ),
        tone: "error",
      });
      throw error;
    }
  }

  async function runDiagnosticAction<T>(
    action: () => Promise<T>,
    successTitle: string,
    getDescription: (result: T) => string = () =>
      "Projecto completed the diagnostic action successfully.",
  ): Promise<void> {
    try {
      const result = await action();
      pushToast({
        title: successTitle,
        description: getDescription(result),
        tone: "success",
      });
    } catch (error) {
      pushToast({
        title: "Diagnostic action failed",
        description: getFriendlyErrorMessage(
          error,
          "Projecto could not complete this diagnostic action.",
        ),
        tone: "error",
      });
    }
  }

  async function handleTestEditor(): Promise<void> {
    try {
      const result = await window.launchStack.diagnostics.testEditor();
      pushToast({
        title: result.ok ? result.label : `${result.label} failed`,
        description: result.message,
        tone: result.ok ? "success" : "error",
      });
    } catch (error) {
      pushToast({
        title: "Editor test failed",
        description: getFriendlyErrorMessage(
          error,
          "Projecto could not test VS Code on this device.",
        ),
        tone: "error",
      });
    }
  }

  async function handleTestTerminal(): Promise<void> {
    try {
      const result = await window.launchStack.diagnostics.testTerminal();
      pushToast({
        title: result.ok ? result.label : `${result.label} failed`,
        description: result.message,
        tone: result.ok ? "success" : "error",
      });
    } catch (error) {
      pushToast({
        title: "Terminal test failed",
        description: getFriendlyErrorMessage(
          error,
          "Projecto could not test the OS terminal on this device.",
        ),
        tone: "error",
      });
    }
  }

  async function handleSignIn(): Promise<void> {
    try {
      await startGoogleSignIn();
    } catch (error) {
      pushToast({
        title: "Unable to start sign-in",
        description: getFriendlyErrorMessage(
          error,
          "Projecto could not open the browser sign-in flow.",
        ),
        tone: "error",
      });
    }
  }

  async function handleRefreshSubscription(): Promise<void> {
    try {
      await refreshSubscription();
      pushToast({
        title: "Subscription refreshed",
        description:
          "Projecto updated this device with the latest account and plan state.",
        tone: "success",
      });
    } catch (error) {
      pushToast({
        title: "Unable to refresh subscription",
        description: getFriendlyErrorMessage(
          error,
          "Projecto could not refresh your subscription right now.",
        ),
        tone: "error",
      });
    }
  }

  async function handleOpenBilling(): Promise<void> {
    try {
      await openUpgradePage();
    } catch (error) {
      pushToast({
        title: "Unable to open billing page",
        description: getFriendlyErrorMessage(
          error,
          "Projecto could not open the web billing page.",
        ),
        tone: "error",
      });
    }
  }

  return (
    <div className="space-y-6">
      <AccountBillingSettings
        loading={subscriptionLoading}
        lockedProjectCount={
          projects.filter((project) => project.lockedBySubscription).length
        }
        onOpenBilling={handleOpenBilling}
        onRefreshSubscription={handleRefreshSubscription}
        onSignIn={handleSignIn}
        online={online}
        projectCount={projects.length}
        subscription={subscription}
      />
      <SettingsForm
        onExportDiagnostics={() =>
          runDiagnosticAction(
            () => window.launchStack.diagnostics.exportReport(),
            "Diagnostics exported",
          )
        }
        onOpenAppDataFolder={() =>
          runDiagnosticAction(
            () => window.launchStack.diagnostics.openAppDataFolder(),
            "App data folder opened",
          )
        }
        onResetCommandApprovals={() =>
          runDiagnosticAction(
            () => window.launchStack.diagnostics.resetCommandApprovals(),
            "Command approvals reset",
          )
        }
        onSettingsChange={handleSettingsChange}
        onTestEditor={handleTestEditor}
        onTestTerminal={handleTestTerminal}
        saveMessage={saveMessage}
        saveStatus={saveStatus}
        settings={settings}
      />
    </div>
  );
}