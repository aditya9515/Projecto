import {
  Activity,
  CreditCard,
  Monitor,
  RefreshCw,
  Settings2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isProPlan, needsReconnect } from "../../billing/upgradeGate";
import type { DiagnosticsReport } from "../../main/types/shared";
import { EmptyState } from "../components/common/EmptyState";
import { AccountIdentity } from "../components/common/AccountIdentity";
import { Button } from "../components/common/Button";
import { PlanBadge } from "../components/common/PlanBadge";
import { PremiumCard } from "../components/common/PremiumCard";
import { useAppStatusStore } from "../store/useAppStatusStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { useSubscriptionStore } from "../store/useSubscriptionStore";
import { useToastStore } from "../store/useToastStore";
import { formatAbsoluteDate } from "../utils/format";
export function AccountPage(): JSX.Element {
  const navigate = useNavigate();
  const settings = useSettingsStore((state) => state.settings);
  const bridgeState = useAppStatusStore((state) => state.bridgeState);
  const online = useAppStatusStore((state) => state.online);
  const lastSyncedAt = useAppStatusStore((state) => state.lastSyncedAt);
  const latestSyncError = useAppStatusStore((state) => state.latestSyncError);
  const subscription = useSubscriptionStore((state) => state.subscription);
  const loading = useSubscriptionStore((state) => state.loading);
  const startGoogleSignIn = useSubscriptionStore(
    (state) => state.startGoogleSignIn,
  );
  const refreshSubscription = useSubscriptionStore(
    (state) => state.refreshSubscription,
  );
  const openUpgradePage = useSubscriptionStore(
    (state) => state.openUpgradePage,
  );
  const pushToast = useToastStore((state) => state.pushToast);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsReport | null>(
    null,
  );
  const pro = isProPlan(subscription);
  const reconnect = needsReconnect(subscription);
  useEffect(() => {
    void window.launchStack.diagnostics
      .getReport()
      .then(setDiagnostics)
      .catch(() => undefined);
  }, []);
  if (!subscription.email) {
    return (
      <EmptyState
        actionLabel="Sign in with Projecto"
        description="Connect this desktop app to your Projecto account to view your plan, synced access, and desktop status."
        icon={<UserRound className="h-6 w-6" />}
        onAction={() => {
          void startGoogleSignIn().catch((error) => {
            pushToast({
              title: "Unable to open Projecto sign-in",
              description:
                error instanceof Error
                  ? error.message
                  : "Unknown sign-in error.",
              tone: "error",
            });
          });
        }}
        title="Account not connected"
      />
    );
  }
  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      {" "}
      <aside className="space-y-6 xl:sticky xl:top-0 xl:self-start">
        {" "}
        <PremiumCard className="overflow-hidden p-0">
          {" "}
          <div className="border-b border-line px-5 py-5">
            {" "}
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
              Account
            </div>{" "}
            <div className="mt-4">
              {" "}
              <AccountIdentity subscription={subscription} />{" "}
            </div>{" "}
          </div>{" "}
          <div className="space-y-3 px-5 py-5">
            {" "}
            <AccountStat
              label="Current access"
              value={
                pro
                  ? "Pro verified"
                  : reconnect
                    ? "Reconnect required"
                    : "Standard"
              }
            />{" "}
            <AccountStat
              label="Subscription status"
              value={subscription.status}
            />{" "}
            <AccountStat
              label="Billing cycle"
              value={subscription.billingCycle ?? "Not available"}
            />{" "}
            <AccountStat
              label="Renewal"
              value={formatAbsoluteDate(subscription.expiresAt)}
            />{" "}
            <AccountStat
              label="Last verified"
              value={formatAbsoluteDate(subscription.lastVerifiedAt)}
            />{" "}
            <AccountStat
              label="Hidden on Standard"
              value={String(subscription.archivedProjectCount ?? 0)}
            />{" "}
            <AccountStat
              label="Device"
              value={
                diagnostics
                  ? `${diagnostics.platform} ${diagnostics.arch}`
                  : "This device"
              }
            />{" "}
          </div>{" "}
        </PremiumCard>{" "}
      </aside>{" "}
      <div className="space-y-6">
        {" "}
        <PremiumCard className="p-6">
          {" "}
          <div className="flex items-start gap-3">
            {" "}
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-shell text-text">
              {" "}
              <ShieldCheck className="h-4 w-4" />{" "}
            </div>{" "}
            <div className="min-w-0 flex-1">
              {" "}
              <div className="flex flex-wrap items-center gap-3">
                {" "}
                <div className="text-lg font-semibold text-text">
                  Desktop access
                </div>{" "}
                <PlanBadge
                  plan={subscription.plan}
                  status={subscription.status}
                />{" "}
              </div>{" "}
              <div className="mt-2 text-sm leading-6 text-muted">
                {" "}
                Projecto verifies your plan through your hosted account and
                restores this desktop session automatically when the app
                opens.{" "}
              </div>{" "}
            </div>{" "}
          </div>{" "}
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {" "}
            <AccountStat
              label="Connected email"
              value={subscription.email}
            />{" "}
            <AccountStat
              label="Customer id"
              value={subscription.customerId ?? "Not available"}
            />{" "}
            <AccountStat
              label="Current period end"
              value={formatAbsoluteDate(
                subscription.currentPeriodEnd ?? undefined,
              )}
            />{" "}
            <AccountStat
              label="Projects hidden on Standard"
              value={String(subscription.archivedProjectCount ?? 0)}
            />{" "}
            <AccountStat
              label="Sync status"
              value={
                latestSyncError
                  ? "Needs attention"
                  : online
                    ? "Online"
                    : "Offline"
              }
            />{" "}
            <AccountStat
              label="Last sync"
              value={formatAbsoluteDate(lastSyncedAt)}
            />{" "}
          </div>{" "}
          <div className="mt-5 rounded-[24px] border border-line bg-shell p-4 text-sm text-muted">
            {" "}
            {pro
              ? "This device has verified Pro access and can use premium gated features immediately."
              : subscription.archivedProjectCount &&
                  subscription.archivedProjectCount > 0
                ? `This device is currently using Standard access. ${subscription.archivedProjectCount} project${subscription.archivedProjectCount === 1 ? "" : "s"} are hidden until Pro is active again.`
                : "This device is currently using Standard access. Upgrade or refresh from the web if your billing state changed recently."}{" "}
          </div>{" "}
        </PremiumCard>{" "}
        <div className="grid gap-6 lg:grid-cols-2">
          {" "}
          <PremiumCard className="p-6">
            {" "}
            <div className="flex items-start gap-3">
              {" "}
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-shell text-text">
                {" "}
                <Monitor className="h-4 w-4" />{" "}
              </div>{" "}
              <div className="min-w-0 flex-1">
                {" "}
                <div className="text-lg font-semibold text-text">
                  Device and extension
                </div>{" "}
                <div className="mt-2 text-sm leading-6 text-muted">
                  {" "}
                  Check whether this desktop app, local bridge, and editor
                  companion are ready for workspace launches.{" "}
                </div>{" "}
              </div>{" "}
            </div>{" "}
            <div className="mt-5 grid gap-3">
              {" "}
              <AccountStat
                label="Desktop bridge"
                value={bridgeState.status}
              />{" "}
              <AccountStat
                label="Bridge port"
                value={
                  bridgeState.port ? String(bridgeState.port) : "Not ready"
                }
              />{" "}
              <AccountStat
                label="Extension"
                value={bridgeState.extensionConnected ? "Connected" : "Waiting"}
              />{" "}
              <AccountStat
                label="Protocol"
                value={bridgeState.protocolVersion}
              />{" "}
            </div>{" "}
            <div className="mt-5 flex flex-col gap-3">
              {" "}
              <Button onClick={() => navigate("/health")} variant="secondary">
                {" "}
                <Activity className="h-4 w-4" /> Open Health{" "}
              </Button>{" "}
              <Button onClick={() => navigate("/settings")} variant="ghost">
                {" "}
                Configure terminal mode{" "}
              </Button>{" "}
            </div>{" "}
          </PremiumCard>{" "}
          <PremiumCard className="p-6">
            {" "}
            <div className="flex items-start gap-3">
              {" "}
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-shell text-text">
                {" "}
                <CreditCard className="h-4 w-4" />{" "}
              </div>{" "}
              <div className="min-w-0 flex-1">
                {" "}
                <div className="text-lg font-semibold text-text">
                  Billing and sync
                </div>{" "}
                <div className="mt-2 text-sm leading-6 text-muted">
                  {" "}
                  Manage your plan on the web, then refresh this desktop app
                  whenever your billing state changes.{" "}
                </div>{" "}
              </div>{" "}
            </div>{" "}
            <div className="mt-5 flex flex-col gap-3">
              {" "}
              <Button
                onClick={async () => {
                  try {
                    await openUpgradePage();
                  } catch (error) {
                    pushToast({
                      title: "Unable to open billing page",
                      description:
                        error instanceof Error
                          ? error.message
                          : "Unknown billing error.",
                      tone: "error",
                    });
                  }
                }}
                variant="primary"
              >
                {" "}
                Manage Billing on Web{" "}
              </Button>{" "}
              <Button
                onClick={async () => {
                  try {
                    await refreshSubscription();
                    pushToast({
                      title: "Subscription refreshed",
                      description:
                        "Desktop account status was refreshed successfully.",
                      tone: "success",
                    });
                  } catch (error) {
                    pushToast({
                      title: "Unable to refresh subscription",
                      description:
                        error instanceof Error
                          ? error.message
                          : "Unknown subscription error.",
                      tone: "error",
                    });
                  }
                }}
                variant="secondary"
              >
                {" "}
                <RefreshCw className="h-4 w-4" />{" "}
                {loading ? "Refreshing..." : "Refresh Subscription"}{" "}
              </Button>{" "}
              <Button onClick={() => navigate("/pricing")} variant="ghost">
                {" "}
                View plan details{" "}
              </Button>{" "}
              <Button onClick={() => navigate("/health")} variant="ghost">
                {" "}
                Reconnect guidance{" "}
              </Button>{" "}
            </div>{" "}
          </PremiumCard>{" "}
          <PremiumCard className="p-6">
            {" "}
            <div className="flex items-start gap-3">
              {" "}
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-shell text-text">
                {" "}
                <Settings2 className="h-4 w-4" />{" "}
              </div>{" "}
              <div className="min-w-0 flex-1">
                {" "}
                <div className="text-lg font-semibold text-text">
                  Application preferences
                </div>{" "}
                <div className="mt-2 text-sm leading-6 text-muted">
                  {" "}
                  Startup behavior, editor preference, terminal control, and
                  privacy settings stay inside the desktop app.{" "}
                </div>{" "}
              </div>{" "}
            </div>{" "}
            <div className="mt-5 grid gap-3">
              {" "}
              <AccountStat
                label="Editor"
                value="VS Code"
              />{" "}
              <AccountStat
                label="Launch on startup"
                value={settings.launchOnStartup ? "Enabled" : "Disabled"}
              />{" "}
              <AccountStat
                label="Ask before run"
                value={
                  settings.askBeforeRunningNewCommands ? "Enabled" : "Disabled"
                }
              />{" "}
            </div>{" "}
            <div className="mt-5 flex flex-col gap-3">
              {" "}
              <Button onClick={() => navigate("/settings")} variant="secondary">
                {" "}
                Open Settings{" "}
              </Button>{" "}
            </div>{" "}
          </PremiumCard>{" "}
        </div>{" "}
        {subscription.entitlements?.requiresOnline ? (
          <PremiumCard className="p-5">
            {" "}
            <div className="text-sm font-semibold text-text">
              Online desktop account
            </div>{" "}
            <div className="mt-2 text-sm leading-6 text-muted">
              {" "}
              Projecto desktop depends on a live connection for account
              verification, subscription sync, and your project directory
              list.{" "}
            </div>{" "}
          </PremiumCard>
        ) : null}{" "}
      </div>{" "}
    </div>
  );
}
function AccountStat({
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
      <div className="mt-2 text-sm font-medium text-text">{value}</div>{" "}
    </div>
  );
}
