import {
  CreditCard,
  LogIn,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { PLAN_COPY } from "../../../billing/pricing";
import { getPlanDisplayName, isProPlan } from "../../../billing/upgradeGate";
import type { SubscriptionState } from "../../../main/types/shared";
import { formatAbsoluteDate } from "../../utils/format";
import { AccountIdentity } from "../common/AccountIdentity";
import { Button } from "../common/Button";
import { PlanBadge } from "../common/PlanBadge";
import { PremiumCard } from "../common/PremiumCard";
import { StatusPill } from "../common/StatusPill";

type AccountBillingSettingsProps = {
  subscription: SubscriptionState;
  loading: boolean;
  online: boolean;
  projectCount: number;
  lockedProjectCount: number;
  onSignIn: () => Promise<void>;
  onRefreshSubscription: () => Promise<void>;
  onOpenBilling: () => Promise<void>;
};

export function AccountBillingSettings({
  subscription,
  loading,
  online,
  projectCount,
  lockedProjectCount,
  onSignIn,
  onRefreshSubscription,
  onOpenBilling,
}: AccountBillingSettingsProps): JSX.Element {
  const pro = isProPlan(subscription);
  const signedIn = Boolean(subscription.email);
  const planName = getPlanDisplayName(subscription.plan);

  return (
    <section className="space-y-4">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
          Account & Plan
        </div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-text">
          Desktop access and billing
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Manage sign-in, sync, and plan limits.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <PremiumCard className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="app-icon-surface flex h-10 w-10 items-center justify-center rounded-2xl text-text">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold tracking-tight text-text">
                    Account
                  </h3>
                  <p className="text-sm text-muted">
                    {signedIn
                      ? "This desktop app is connected to your Projecto account."
                      : "Sign in to sync projects and subscription access."}
                  </p>
                </div>
              </div>
            </div>
            <StatusPill tone={signedIn ? "success" : "warning"}>
              {signedIn ? "Connected" : "Sign in required"}
            </StatusPill>
          </div>

          <div className="mt-5 space-y-3">
            {signedIn ? (
              <AccountIdentity subscription={subscription} />
            ) : (
              <div className="rounded-2xl border border-line bg-shell px-4 py-3 text-sm text-muted">
                No account is connected on this device.
              </div>
            )}
            <AccountRow label="Network" value={online ? "Online" : "Offline"} />
            <AccountRow
              label="Last verified"
              value={formatAbsoluteDate(subscription.lastVerifiedAt)}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {!signedIn ? (
              <Button disabled={loading} onClick={() => void onSignIn()} variant="primary">
                <LogIn className="h-4 w-4" /> Sign In
              </Button>
            ) : null}
            <Button
              disabled={loading || !online}
              onClick={() => void onRefreshSubscription()}
              variant="secondary"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </PremiumCard>

        <PremiumCard className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="app-icon-surface flex h-10 w-10 items-center justify-center rounded-2xl text-text">
                  <CreditCard className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold tracking-tight text-text">
                    Current Plan
                  </h3>
                  <p className="text-sm text-muted">
                    {pro
                      ? "Plus is active. Limits are unlocked."
                      : "Free includes 5 projects and 1 active launch."}
                  </p>
                </div>
              </div>
            </div>
            <PlanBadge plan={subscription.plan} status={subscription.status} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <PlanStat label="Plan" value={planName} />
            <PlanStat label="Projects" value={String(projectCount)} />
            <PlanStat label="Locked" value={String(lockedProjectCount)} />
          </div>

          {subscription.archivedProjectCount && subscription.archivedProjectCount > 0 ? (
            <div className="mt-4 rounded-2xl border border-line bg-shell px-4 py-3 text-sm text-muted">
              {subscription.archivedProjectCount} archived project
              {subscription.archivedProjectCount === 1 ? "" : "s"} are held in your account and restore automatically when Plus is active.
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button disabled={loading} onClick={() => void onOpenBilling()} variant="primary">
              <Sparkles className="h-4 w-4" /> {pro ? "Manage Billing" : "Pricing"}
            </Button>
            <Button
              disabled={loading || !online}
              onClick={() => void onRefreshSubscription()}
              variant="secondary"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </PremiumCard>

        <PremiumCard className="p-5 xl:col-span-2">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-text">
                Plan Limits
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                Free keeps core launching simple. Plus unlocks larger workspaces and parallel launches.
              </p>
            </div>
            <Button disabled={loading} onClick={() => void onOpenBilling()} variant="secondary">
              <CreditCard className="h-4 w-4" /> Billing Page
            </Button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <PlanColumn
              active={!pro}
              features={PLAN_COPY.free.features}
              title="Free"
            />
            <PlanColumn active={pro} features={PLAN_COPY.pro.features} title={PLAN_COPY.pro.name} />
          </div>
        </PremiumCard>
      </div>
    </section>
  );
}

function AccountRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-shell px-4 py-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-semibold text-text">{value}</span>
    </div>
  );
}

function PlanStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-2xl border border-line bg-shell px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-text">{value}</div>
    </div>
  );
}

function PlanColumn({
  active,
  features,
  title,
}: {
  active: boolean;
  features: string[];
  title: string;
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-line bg-shell p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-text">{title}</div>
        {active ? <StatusPill tone="success">Current</StatusPill> : null}
      </div>
      <ul className="mt-4 space-y-2 text-sm text-muted">
        {features.map((feature) => (
          <li className="flex gap-2" key={feature}>
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-text" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
