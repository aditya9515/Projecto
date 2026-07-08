import * as Switch from "@radix-ui/react-switch";
import {
  CheckCircle2,
  Clock3,
  Database,
  FolderOpen,
  RefreshCw,
  TerminalSquare,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  AppSettings,
  AppSettingsUpdate,
  DesktopBridgeState,
} from "../../../main/types/shared";
import { Button } from "../common/Button";
import { PremiumCard } from "../common/PremiumCard";
import { isVscodeTerminalStrategy } from "../../utils/terminalSessions";

const terminalModeOptions: Array<{
  value: AppSettings["terminalStrategy"];
  label: string;
}> = [
  { value: "os-internal", label: "OS Terminal" },
  { value: "vscode-internal", label: "VS Code Terminal" },
];

function getVisibleTerminalStrategy(
  terminalStrategy: AppSettings["terminalStrategy"],
): AppSettings["terminalStrategy"] {
  return isVscodeTerminalStrategy(terminalStrategy)
    ? "vscode-internal"
    : "os-internal";
}

type SettingsFormProps = {
  settings: AppSettings;
  saveStatus: "idle" | "saving" | "saved" | "failed";
  saveMessage?: string;
  onSettingsChange: (patch: AppSettingsUpdate) => Promise<void>;
  onTestEditor: () => Promise<void>;
  onTestTerminal: () => Promise<void>;
  onOpenAppDataFolder: () => Promise<void>;
  onExportDiagnostics: () => Promise<void>;
  onResetCommandApprovals: () => Promise<void>;
  onRefreshBridge: () => Promise<void>;
  bridgeState: DesktopBridgeState | null;
};
export function SettingsForm({
  settings,
  saveStatus,
  saveMessage,
  onSettingsChange,
  onTestEditor,
  onTestTerminal,
  onOpenAppDataFolder,
  onExportDiagnostics,
  onResetCommandApprovals,
  onRefreshBridge,
  bridgeState,
}: SettingsFormProps): JSX.Element {
  const [draft, setDraft] = useState<AppSettings>(settings);
  useEffect(() => {
    setDraft(settings);
  }, [settings]);
  async function persistPatch(
    patch: AppSettingsUpdate,
    nextSettings: AppSettings,
  ): Promise<void> {
    setDraft(nextSettings);
    try {
      await onSettingsChange(patch);
    } catch {
      setDraft(settings);
    }
  }
  async function handleTerminalStrategySelection(
    terminalStrategy: AppSettings["terminalStrategy"],
  ): Promise<void> {
    await persistPatch({ terminalStrategy }, { ...draft, terminalStrategy });
  }
  return (
    <div className="space-y-6">
      {" "}
      <div className="flex items-center justify-end">
        {" "}
        <SaveStatePill status={saveStatus} message={saveMessage} />{" "}
      </div>{" "}
      <div className="grid gap-6 xl:grid-cols-2">
        {" "}
        <PremiumCard className="p-5 xl:col-span-2">
          {" "}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            {" "}
            <div>
              {" "}
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                General
              </div>{" "}
              <h2 className="mt-2 text-lg font-semibold tracking-tight text-text">
                Desktop startup and workspace behavior
              </h2>{" "}
              <p className="mt-1 text-sm leading-6 text-muted">
                {" "}
                Projecto stays online-authoritative for account and project
                metadata, while local execution remains controlled on this
                device.{" "}
              </p>{" "}
            </div>{" "}
            <SettingsToggle
              checked={draft.launchOnStartup}
              description="Open Projecto automatically when your computer starts."
              label="Launch on startup"
              onCheckedChange={(value) =>
                void persistPatch(
                  { launchOnStartup: value },
                  { ...draft, launchOnStartup: value },
                )
              }
            />{" "}
          </div>{" "}
        </PremiumCard>{" "}
        <PremiumCard className="p-5">
          {" "}
          <div>
            {" "}
            <h2 className="text-lg font-semibold tracking-tight text-text">
              VS Code
            </h2>{" "}
            <p className="mt-1 text-sm leading-6 text-muted">
              Projecto opens projects in VS Code. VS Code terminal runs use the
              Projecto VS Code extension.
            </p>{" "}
          </div>{" "}
          <div className="mt-4 space-y-3">
            {" "}
            <div className="rounded-2xl border border-line bg-shell px-4 py-3">
              {" "}
              <div className="text-sm font-semibold text-text">VS Code</div>{" "}
              <div className="mt-1 text-xs leading-5 text-muted">
                The `code` command must be available on PATH for Projecto to
                open folders.
              </div>{" "}
            </div>{" "}
            <Button onClick={() => void onTestEditor()} variant="secondary">
              {" "}
              <Wrench className="h-4 w-4" /> Test VS Code{" "}
            </Button>{" "}
          </div>{" "}
        </PremiumCard>{" "}
        <PremiumCard className="p-5">
          {" "}
          <div>
            {" "}
            <h2 className="text-lg font-semibold tracking-tight text-text">
              Terminal Mode
            </h2>{" "}
            <p className="mt-1 text-sm leading-6 text-muted">
              Pick where Projecto should run project commands.
            </p>{" "}
          </div>{" "}
          <div className="mt-4">
            {" "}
            <select
              className="h-11 w-full rounded-xl border border-line bg-panel px-3.5 text-sm text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-accent"
              onChange={(event) => {
                void handleTerminalStrategySelection(
                  event.target.value as AppSettings["terminalStrategy"],
                );
              }}
              value={getVisibleTerminalStrategy(draft.terminalStrategy)}
            >
              {" "}
              {terminalModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}{" "}
            </select>{" "}
            <div className="mt-2 space-y-1 text-xs leading-5 text-muted">
              {" "}
              <p>
                OS Terminal runs commands through Projecto and mirrors output
                into Run Logs.
              </p>{" "}
              <p>
                VS Code Terminal runs commands through the Projecto VS Code
                extension.
              </p>{" "}
            </div>{" "}
            {isVscodeTerminalStrategy(draft.terminalStrategy) ? (
              <div className="mt-3 rounded-2xl border border-line bg-shell px-4 py-3 text-xs leading-5 text-muted">
                {" "}
                Extension bridge:{" "}
                <span className="font-semibold text-text">
                  {" "}
                  {bridgeState?.extensionConnected
                    ? "Connected"
                    : "Waiting for extension"}{" "}
                </span>{" "}
                {bridgeState?.port
                  ? ` on 127.0.0.1:${bridgeState.port}`
                  : ""}{" "}
              </div>
            ) : null}{" "}
            <div className="mt-3 flex flex-wrap gap-2">
              {" "}
              <Button onClick={() => void onTestTerminal()} variant="secondary">
                {" "}
                <TerminalSquare className="h-4 w-4" /> Test Terminal{" "}
              </Button>{" "}
              <Button onClick={() => void onRefreshBridge()} variant="ghost">
                {" "}
                <RefreshCw className="h-4 w-4" /> Refresh Bridge{" "}
              </Button>{" "}
            </div>{" "}
          </div>{" "}
        </PremiumCard>{" "}
        <PremiumCard className="p-5 xl:col-span-2">
          {" "}
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            {" "}
            <div>
              {" "}
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                Extension Bridge
              </div>{" "}
              <h2 className="mt-2 text-lg font-semibold tracking-tight text-text">
                Projecto editor connection
              </h2>{" "}
              <p className="mt-1 text-sm leading-6 text-muted">
                {" "}
                VS Code terminal launches use the Projecto extension bridge.
                If it is not connected, choose OS Terminal or connect the VS
                Code extension.{" "}
              </p>{" "}
            </div>{" "}
            <div className="grid min-w-[280px] gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {" "}
              <BridgeStat
                label="Status"
                value={bridgeState?.status ?? "starting"}
              />{" "}
              <BridgeStat
                label="Extension"
                value={
                  bridgeState?.extensionConnected ? "Connected" : "Waiting"
                }
              />{" "}
              <BridgeStat
                label="Port"
                value={
                  bridgeState?.port ? String(bridgeState.port) : "Not ready"
                }
              />{" "}
              <BridgeStat
                label="Protocol"
                value={bridgeState?.protocolVersion ?? "unknown"}
              />{" "}
            </div>{" "}
          </div>{" "}
          {bridgeState?.lastError ? (
            <div className="mt-4 rounded-2xl border border-line bg-shell px-4 py-3 text-sm text-muted">
              {" "}
              Bridge message:{" "}
              <span className="text-text">{bridgeState.lastError}</span>{" "}
            </div>
          ) : null}{" "}
        </PremiumCard>{" "}
        <PremiumCard className="p-5 xl:col-span-2">
          {" "}
          <div>
            {" "}
            <h2 className="text-lg font-semibold tracking-tight text-text">
              Privacy & Safety
            </h2>{" "}
            <p className="mt-1 text-sm leading-6 text-muted">
              Telemetry stays local-only in this MVP, and turning it off stops
              new activity and usage records from being written on this device.
            </p>{" "}
          </div>{" "}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {" "}
            <SettingsToggle
              checked={draft.telemetryEnabled}
              description="Keep local diagnostic telemetry enabled."
              label="Telemetry"
              onCheckedChange={(value) =>
                void persistPatch(
                  { telemetryEnabled: value },
                  { ...draft, telemetryEnabled: value },
                )
              }
            />{" "}
            <SettingsToggle
              checked={draft.askBeforeRunningNewCommands}
              description="Always review exact commands before Projecto executes them."
              label="Ask before running new commands"
              onCheckedChange={(value) =>
                void persistPatch(
                  { askBeforeRunningNewCommands: value },
                  { ...draft, askBeforeRunningNewCommands: value },
                )
              }
            />{" "}
          </div>{" "}
        </PremiumCard>{" "}
        <PremiumCard className="p-5 xl:col-span-2">
          {" "}
          <div>
            {" "}
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
              Privacy & Diagnostics
            </div>{" "}
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-text">
              Support tools
            </h2>{" "}
            <p className="mt-1 text-sm leading-6 text-muted">
              {" "}
              Diagnostic reports exclude command output, source code, payment
              data, tokens, and secrets. Export run logs separately from the
              Runs panel when you choose to.{" "}
            </p>{" "}
          </div>{" "}
          <div className="mt-5 flex flex-wrap gap-2">
            {" "}
            <Button
              onClick={() => void onExportDiagnostics()}
              variant="secondary"
            >
              {" "}
              <Database className="h-4 w-4" /> Export Diagnostics{" "}
            </Button>{" "}
            <Button
              onClick={() => void onOpenAppDataFolder()}
              variant="secondary"
            >
              {" "}
              <FolderOpen className="h-4 w-4" /> Open App Data{" "}
            </Button>{" "}
            <Button
              onClick={() => void onResetCommandApprovals()}
              variant="danger"
            >
              {" "}
              Reset Command Approvals{" "}
            </Button>{" "}
          </div>{" "}
        </PremiumCard>{" "}
      </div>{" "}
    </div>
  );
}
function BridgeStat({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-line bg-shell px-4 py-3">
      {" "}
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted">
        {label}
      </div>{" "}
      <div className="mt-1 text-sm font-semibold text-text">{value}</div>{" "}
    </div>
  );
}
function SaveStatePill({
  status,
  message,
}: {
  status: "idle" | "saving" | "saved" | "failed";
  message?: string;
}): JSX.Element {
  if (status === "idle") {
    return (
      <div className="text-xs text-muted">
        Settings auto-save as you make changes.
      </div>
    );
  }
  const icon =
    status === "saving" ? (
      <Clock3 className="h-3.5 w-3.5" />
    ) : status === "failed" ? (
      <TriangleAlert className="h-3.5 w-3.5" />
    ) : (
      <CheckCircle2 className="h-3.5 w-3.5" />
    );
  return (
    <div className="app-status-neutral inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium">
      {" "}
      {icon}{" "}
      {message ??
        (status === "saving"
          ? "Saving..."
          : status === "failed"
            ? "Failed to save"
            : "Saved")}{" "}
    </div>
  );
}
type SettingsToggleProps = {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};
function SettingsToggle({
  label,
  description,
  checked,
  onCheckedChange,
}: SettingsToggleProps): JSX.Element {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-shell px-4 py-3">
      {" "}
      <div className="pr-4">
        {" "}
        <div className="text-sm font-medium text-text">{label}</div>{" "}
        <div className="text-xs text-muted">{description}</div>{" "}
      </div>{" "}
      <Switch.Root
        checked={checked}
        className="app-switch-track relative h-7 w-12 rounded-full transition"
        onCheckedChange={onCheckedChange}
      >
        {" "}
        <Switch.Thumb className="app-switch-thumb block h-5 w-5 translate-x-1 rounded-full transition data-[state=checked]:translate-x-6" />{" "}
      </Switch.Root>{" "}
    </div>
  );
}
