import * as Switch from "@radix-ui/react-switch";
import {
  CheckCircle2,
  Clock3,
  Database,
  FolderOpen,
  TerminalSquare,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  AppSettings,
  AppSettingsUpdate,
} from "../../../main/types/shared";
import { Button } from "../common/Button";
import { PremiumCard } from "../common/PremiumCard";

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <SaveStatePill status={saveStatus} message={saveMessage} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <PremiumCard className="p-5 xl:col-span-2">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                General
              </div>
              <h2 className="mt-2 text-lg font-semibold tracking-tight text-text">
                Desktop behavior
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                Projecto keeps account metadata synced and runs project commands on this device.
              </p>
            </div>
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
            />
          </div>
        </PremiumCard>

        <PremiumCard className="p-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-text">
              Editor
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Projecto opens folders in VS Code when a launch profile requests it.
            </p>
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-line bg-shell px-4 py-3">
              <div className="text-sm font-semibold text-text">VS Code</div>
              <div className="mt-1 text-xs leading-5 text-muted">
                The `code` command must be available on PATH.
              </div>
            </div>
            <Button onClick={() => void onTestEditor()} variant="secondary">
              <Wrench className="h-4 w-4" /> Test VS Code
            </Button>
          </div>
        </PremiumCard>

        <PremiumCard className="p-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-text">
              Terminal
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Project commands open in Windows Terminal and mirror output into Run Logs.
            </p>
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-line bg-shell px-4 py-3">
              <div className="text-sm font-semibold text-text">Windows Terminal</div>
              <div className="mt-1 text-xs leading-5 text-muted">
                Visible terminal sessions are mapped to each running project.
              </div>
            </div>
            <Button onClick={() => void onTestTerminal()} variant="secondary">
              <TerminalSquare className="h-4 w-4" /> Test Terminal
            </Button>
          </div>
        </PremiumCard>

        <PremiumCard className="p-5 xl:col-span-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-text">
              Privacy & Safety
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Keep diagnostics local and review commands before execution.
            </p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
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
            />
            <SettingsToggle
              checked={draft.askBeforeRunningNewCommands}
              description="Review exact commands before Projecto runs them."
              label="Ask before running commands"
              onCheckedChange={(value) =>
                void persistPatch(
                  { askBeforeRunningNewCommands: value },
                  { ...draft, askBeforeRunningNewCommands: value },
                )
              }
            />
          </div>
        </PremiumCard>

        <PremiumCard className="p-5 xl:col-span-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
              Diagnostics
            </div>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-text">
              Support tools
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Diagnostic reports exclude command output, source code, payment data, tokens, and secrets.
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => void onExportDiagnostics()} variant="secondary">
              <Database className="h-4 w-4" /> Export Diagnostics
            </Button>
            <Button onClick={() => void onOpenAppDataFolder()} variant="secondary">
              <FolderOpen className="h-4 w-4" /> Open App Data
            </Button>
            <Button onClick={() => void onResetCommandApprovals()} variant="danger">
              Reset Command Approvals
            </Button>
          </div>
        </PremiumCard>
      </div>
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
    return <div className="text-xs text-muted">Settings auto-save.</div>;
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
      {icon}
      {message ??
        (status === "saving"
          ? "Saving..."
          : status === "failed"
            ? "Failed to save"
            : "Saved")}
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
      <div className="pr-4">
        <div className="text-sm font-medium text-text">{label}</div>
        <div className="text-xs text-muted">{description}</div>
      </div>
      <Switch.Root
        checked={checked}
        className="app-switch-track relative h-7 w-12 rounded-full transition"
        onCheckedChange={onCheckedChange}
      >
        <Switch.Thumb className="app-switch-thumb block h-5 w-5 translate-x-1 rounded-full transition data-[state=checked]:translate-x-6" />
      </Switch.Root>
    </div>
  );
}