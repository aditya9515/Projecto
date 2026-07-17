import {
  Clipboard,
  FolderCog,
  RefreshCw,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPlanDisplayName } from "../../billing/upgradeGate";
import type { DiagnosticsReport } from "../../main/types/shared";
import { Button } from "../components/common/Button";
import { PageHeader } from "../components/common/PageHeader";
import { PremiumCard } from "../components/common/PremiumCard";
import { StatusPill } from "../components/common/StatusPill";
import { HealthStatusCard } from "../components/health/HealthStatusCard";
import { RunningPortsPanel } from "../components/health/RunningPortsPanel";
import { useAppStatusStore } from "../store/useAppStatusStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { useSubscriptionStore } from "../store/useSubscriptionStore";
import { useToastStore } from "../store/useToastStore";
import { formatAbsoluteDate } from "../utils/format";
import { getFriendlyErrorMessage } from "../utils/errors";
import { formatTerminalStrategyLabel } from "../utils/terminalSessions";
function healthTone(ok: boolean): "success" | "danger" {
  return ok ? "success" : "danger";
}
export function HealthPage(): JSX.Element {
  const navigate = useNavigate();
  const pushToast = useToastStore((state) => state.pushToast);
  const online = useAppStatusStore((state) => state.online);
  const lastSyncedAt = useAppStatusStore((state) => state.lastSyncedAt);
  const latestSyncError = useAppStatusStore((state) => state.latestSyncError);
  const latestBillingError = useAppStatusStore(
    (state) => state.latestBillingError,
  );
  const recentLaunchFailures = useAppStatusStore(
    (state) => state.recentLaunchFailures,
  );
  const settings = useSettingsStore((state) => state.settings);
  const subscription = useSubscriptionStore((state) => state.subscription);
  const refreshSubscription = useSubscriptionStore(
    (state) => state.refreshSubscription,
  );
  const loadSubscription = useSubscriptionStore(
    (state) => state.loadSubscription,
  );
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const loadReport = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      setReport(await window.launchStack.diagnostics.getReport());
    } catch (error) {
      pushToast({
        title: "Unable to load diagnostics",
        description: getFriendlyErrorMessage(error, "Projecto could not load diagnostics."),
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);
  useEffect(() => {
    void loadReport();
  }, [loadReport]);
  const healthCards = useMemo(
    () => [
      {
        title: "Internet",
        value: online ? "Online" : "Offline",
        description: online
          ? "Projecto can reach hosted account and sync services."
          : "Strict online mode blocks workspace access until reconnected.",
        tone: healthTone(online),
      },
      {
        title: "Account",
        value: subscription.email ?? "Not signed in",
        description: subscription.email
          ? "Desktop session is present on this device."
          : "Sign in through Projecto Web to use synced workspace data.",
        tone: healthTone(Boolean(subscription.email)),
      },
      {
        title: "Subscription",
        value: getPlanDisplayName(subscription.plan),
        description: `Last verified ${formatAbsoluteDate(subscription.lastVerifiedAt)}.`,
        tone:
          subscription.status === "active" || subscription.plan === "free"
            ? "success"
            : "warning",
      },
      {
        title: "Backend Sync",
        value: latestSyncError ? "Needs attention" : "Ready",
        description:
          latestSyncError ?? `Last sync ${formatAbsoluteDate(lastSyncedAt)}.`,
        tone: latestSyncError ? "danger" : "success",
      },
      {
        title: "Editor",
        value: "VS Code",
        description: "VS Code is the desktop editor for Projecto.",
        tone: "success",
      },
      {
        title: "Terminal",
        value: formatTerminalStrategyLabel(settings),
        description: "Commands open in Windows Terminal with mirrored output.",
        tone: "neutral",
      },
    ],
    [      lastSyncedAt,
      latestSyncError,
      online,
      settings,
      subscription,
    ],
  );
  return (
    <div className="space-y-6">
      {" "}
      <PageHeader
        actions={
          <>
            {" "}
            <Button
              onClick={async () => {
                try {
                  await refreshSubscription();
                  await loadSubscription();
                  await loadReport();
                  pushToast({
                    title: "Subscription refreshed",
                    description: "Projecto health data is up to date.",
                    tone: "success",
                  });
                } catch (error) {
                  pushToast({
                    title: "Refresh failed",
                    description: getFriendlyErrorMessage(error, "Projecto could not refresh health data."),
                    tone: "error",
                  });
                }
              }}
              variant="primary"
            >
              {" "}
              <RefreshCw className="h-4 w-4" /> Refresh{" "}
            </Button>{" "}
            <Button onClick={() => navigate("/settings")} variant="secondary">
              {" "}
              <Settings className="h-4 w-4" /> Settings{" "}
            </Button>{" "}
          </>
        }
        description="Check Projecto Desktop, account sync, terminal state, and recent launch failures from one place."
        eyebrow="Diagnostics"
        title="Projecto Health"
      />{" "}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {" "}
        {healthCards.map((card) => (
          <HealthStatusCard
            description={card.description}
            key={card.title}
            title={card.title}
            tone={card.tone as "success" | "warning" | "danger" | "neutral"}
            value={card.value}
          />
        ))}{" "}
      </div>{" "}
      <RunningPortsPanel />{" "}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        {" "}
        <PremiumCard className="p-5">
          {" "}
          <div className="flex items-start justify-between gap-3">
            {" "}
            <div>
              {" "}
              <div className="text-lg font-semibold text-text">
                Diagnostic report
              </div>{" "}
              <p className="mt-2 text-sm leading-6 text-muted">
                {" "}
                Reports exclude command output, source code, payment data,
                Firebase credentials, and desktop session tokens.{" "}
              </p>{" "}
            </div>{" "}
            <StatusPill
              tone={report ? "success" : loading ? "warning" : "neutral"}
            >
              {report ? "ready" : loading ? "loading" : "idle"}
            </StatusPill>{" "}
          </div>{" "}
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {" "}
            <DiagnosticItem
              label="App version"
              value={report?.appVersion ?? "Loading..."}
            />{" "}
            <DiagnosticItem
              label="Protocol"
              value={report?.protocolVersion ?? "unknown"}
            />{" "}
            <DiagnosticItem
              label="Platform"
              value={
                report ? `${report.platform} ${report.arch}` : "Loading..."
              }
            />{" "}
            <DiagnosticItem
              label="Project count"
              value={String(report?.projectCount ?? 0)}
            />{" "}
            <DiagnosticItem
              label="User data"
              value={report?.userDataPath ?? "Loading..."}
            />{" "}
            <DiagnosticItem
              label="Billing event"
              value={latestBillingError ?? "No billing errors"}
            />{" "}
          </div>{" "}
          <div className="mt-5 flex flex-wrap gap-3">
            {" "}
            <Button
              onClick={() => void window.launchStack.diagnostics.copyReport()}
              variant="secondary"
            >
              {" "}
              <Clipboard className="h-4 w-4" /> Copy Diagnostics{" "}
            </Button>{" "}
            <Button
              onClick={() => void window.launchStack.diagnostics.exportReport()}
              variant="secondary"
            >
              {" "}
              <FolderCog className="h-4 w-4" /> Export Diagnostics{" "}
            </Button>{" "}
            <Button
              onClick={() =>
                void window.launchStack.diagnostics.openAppDataFolder()
              }
              variant="ghost"
            >
              {" "}
              Open App Data{" "}
            </Button>{" "}
          </div>{" "}
        </PremiumCard>{" "}
        <PremiumCard className="p-5">
          {" "}
          <div className="flex items-start gap-3">
            {" "}
            <div className="app-icon-surface flex h-11 w-11 items-center justify-center rounded-2xl text-text">
              {" "}
              <ShieldCheck className="h-4 w-4" />{" "}
            </div>{" "}
            <div>
              {" "}
              <div className="text-lg font-semibold text-text">
                Recent launch failures
              </div>{" "}
              <p className="mt-2 text-sm leading-6 text-muted">
                Use this list to jump from a health warning to the run logs or
                project repair flow.
              </p>{" "}
            </div>{" "}
          </div>{" "}
          <div className="mt-5 space-y-3">
            {" "}
            {recentLaunchFailures.length > 0 ? (
              recentLaunchFailures.map((event) => (
                <div
                  className="rounded-2xl border border-line bg-shell px-4 py-3"
                  key={`${event.runId}-${event.timestamp}`}
                >
                  {" "}
                  <div className="text-sm font-semibold text-text">
                    {event.message}
                  </div>{" "}
                  <div className="mt-1 text-xs text-muted">
                    {formatAbsoluteDate(event.timestamp)}
                  </div>{" "}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-muted">
                {" "}
                No recent launch failures recorded in this session.{" "}
              </div>
            )}{" "}
          </div>{" "}
        </PremiumCard>{" "}
      </div>{" "}
    </div>
  );
}
function DiagnosticItem({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="rounded-[22px] border border-line bg-shell px-4 py-3">
      {" "}
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted">
        {label}
      </div>{" "}
      <div className="mt-2 break-words text-sm font-medium text-text">
        {value}
      </div>{" "}
    </div>
  );
}
