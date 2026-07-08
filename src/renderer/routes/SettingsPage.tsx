import { useEffect, useState } from "react";
import { parseUpgradeReason } from "../../billing/upgradeGate";
import type {
  AppSettingsUpdate,
  DesktopBridgeState,
} from "../../main/types/shared";
import { SettingsForm } from "../components/settings/SettingsForm";
import { useSettingsStore } from "../store/useSettingsStore";
import { useToastStore } from "../store/useToastStore";
type SaveStatus = "idle" | "saving" | "saved" | "failed";
export function SettingsPage(): JSX.Element {
  const settings = useSettingsStore((state) => state.settings);
  const initialized = useSettingsStore((state) => state.initialized);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const pushToast = useToastStore((state) => state.pushToast);
  const [bridgeState, setBridgeState] = useState<DesktopBridgeState | null>(
    null,
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!initialized) {
      void loadSettings();
    }
  }, [initialized, loadSettings]);
  useEffect(() => {
    void window.launchStack.launcher
      .getBridgeState()
      .then(setBridgeState)
      .catch(() => undefined);
    return window.launchStack.launcher.onBridgeState(setBridgeState);
  }, []);
  async function handleSettingsChange(patch: AppSettingsUpdate): Promise<void> {
    setSaveStatus("saving");
    setSaveMessage("Saving...");
    try {
      await updateSettings(patch);
      setSaveStatus("saved");
      setSaveMessage("Saved");
    } catch (error) {
      const upgradeReason = parseUpgradeReason(error);
      if (upgradeReason) {
        setSaveStatus("failed");
        setSaveMessage("Upgrade required");
        pushToast({
          title: "Upgrade required",
          description: `This setting requires ${upgradeReason}.`,
          tone: "error",
        });
        throw error;
      }
      setSaveStatus("failed");
      setSaveMessage("Failed to save");
      pushToast({
        title: "Unable to save settings",
        description:
          error instanceof Error ? error.message : "Unknown settings error.",
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
        description:
          error instanceof Error ? error.message : "Unknown diagnostic error.",
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
        description:
          error instanceof Error ? error.message : "Unknown editor test error.",
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
        description:
          error instanceof Error ? error.message : "Unknown terminal test error.",
        tone: "error",
      });
    }
  }
  async function handleRefreshBridge(): Promise<void> {
    try {
      const nextBridgeState = await window.launchStack.launcher.getBridgeState();
      setBridgeState(nextBridgeState);
      pushToast({
        title: "Bridge refreshed",
        description: nextBridgeState.extensionConnected
          ? "Projecto editor extension is connected."
          : "Bridge is running, but the editor extension is not connected yet.",
        tone: "success",
      });
    } catch (error) {
      pushToast({
        title: "Bridge refresh failed",
        description:
          error instanceof Error ? error.message : "Unknown bridge refresh error.",
        tone: "error",
      });
    }
  }
  return (
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
      onRefreshBridge={handleRefreshBridge}
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
      bridgeState={bridgeState}
    />
  );
}
