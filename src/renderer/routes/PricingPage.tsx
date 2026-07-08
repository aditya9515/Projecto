import { Crown, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import {
  BILLING_DISPLAY,
  PLAN_COPY,
  PRICING_MATRIX,
} from "../../billing/pricing";
import { isProPlan, needsReconnect } from "../../billing/upgradeGate";
import { AccountIdentity } from "../components/common/AccountIdentity";
import { Button } from "../components/common/Button";
import { PlanBadge } from "../components/common/PlanBadge";
import { PremiumCard } from "../components/common/PremiumCard";
import { PricingToggle } from "../components/common/PricingToggle";
import { useSubscriptionStore } from "../store/useSubscriptionStore";
import { useToastStore } from "../store/useToastStore";
import { getAccountDisplayName } from "../utils/account";
import { formatAbsoluteDate } from "../utils/format";
export function PricingPage(): JSX.Element {
  const subscription = useSubscriptionStore((state) => state.subscription);
  const latestEvent = useSubscriptionStore((state) => state.latestEvent);
  const openUpgradePage = useSubscriptionStore(
    (state) => state.openUpgradePage,
  );
  const startGoogleSignIn = useSubscriptionStore(
    (state) => state.startGoogleSignIn,
  );
  const refreshSubscription = useSubscriptionStore(
    (state) => state.refreshSubscription,
  );
  const upgradeReason = useSubscriptionStore((state) => state.upgradeReason);
  const pushToast = useToastStore((state) => state.pushToast);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    "monthly",
  );
  const pro = isProPlan(subscription);
  const reconnect = needsReconnect(subscription);
  const selectedPricing = BILLING_DISPLAY[billingCycle];
  const accountDisplayName = getAccountDisplayName(subscription);
  return (
    <div className="space-y-6">
      {" "}
      <PremiumCard className="overflow-hidden p-6">
        {" "}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          {" "}
          <div className="space-y-3">
            {" "}
            <PlanBadge
              plan={subscription.plan}
              status={subscription.status}
            />{" "}
            <div>
              {" "}
              <h2 className="text-3xl font-semibold tracking-tight text-text">
                Manage your plan on the web. Keep your workspace ready here.
              </h2>{" "}
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                {" "}
                Manage your plan in the browser, sign in with Projecto once,
                then refresh this device to keep desktop access in sync.{" "}
              </p>{" "}
            </div>{" "}
          </div>{" "}
          <div className="flex flex-wrap gap-3">
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
              Open Web Pricing <ExternalLink className="h-4 w-4" />{" "}
            </Button>{" "}
            <Button
              onClick={async () => {
                try {
                  await refreshSubscription();
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
              <RefreshCw className="h-4 w-4" /> Refresh Subscription{" "}
            </Button>{" "}
          </div>{" "}
        </div>{" "}
      </PremiumCard>{" "}
      {latestEvent?.type === "auth-failed" ||
      latestEvent?.type === "subscription-refresh-failed" ? (
        <PremiumCard className="border border-line p-5">
          {" "}
          <div className="text-lg font-semibold text-text">
            Subscription sync needs attention
          </div>{" "}
          <div className="mt-2 text-sm text-muted">
            {latestEvent.message ??
              "Reconnect and refresh to continue using Pro features."}
          </div>{" "}
        </PremiumCard>
      ) : null}{" "}
      {upgradeReason ? (
        <PremiumCard className="p-5">
          {" "}
          <div className="text-lg font-semibold text-text">
            Upgrade context
          </div>{" "}
          <div className="mt-2 text-sm leading-6 text-muted">
            {" "}
            Projecto opened this page because a Pro-gated action was requested.
            Complete checkout on Projecto Web, then return here and refresh your
            subscription.{" "}
          </div>{" "}
        </PremiumCard>
      ) : null}{" "}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {" "}
        <PremiumCard className="p-6">
          {" "}
          <div className="flex items-start justify-between gap-4">
            {" "}
            <div>
              {" "}
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
                {PLAN_COPY.free.tagline}
              </div>{" "}
              <div className="mt-2 text-2xl font-semibold tracking-tight text-text">
                {PLAN_COPY.free.name}
              </div>{" "}
              <div className="mt-2 text-sm text-muted">
                {PLAN_COPY.free.description}
              </div>{" "}
            </div>{" "}
            {subscription.plan === "free" ? (
              <PlanBadge plan="free" status={subscription.status} />
            ) : null}{" "}
          </div>{" "}
          <div className="mt-6 space-y-3">
            {" "}
            {PLAN_COPY.free.features.map((feature) => (
              <div className="flex items-start gap-3" key={feature}>
                {" "}
                <div className="mt-1 h-2 w-2 rounded-full bg-accent" />{" "}
                <div className="text-sm text-muted">{feature}</div>{" "}
              </div>
            ))}{" "}
          </div>{" "}
        </PremiumCard>{" "}
        <PremiumCard className="app-neutral-highlight border-line p-6">
          {" "}
          <div className="flex items-start justify-between gap-4">
            {" "}
            <div>
              {" "}
              <div className="inline-flex items-center gap-2 rounded-full border border-line bg-shell px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text">
                {" "}
                <Crown className="h-3.5 w-3.5" /> Pro{" "}
              </div>{" "}
              <div className="mt-3 text-2xl font-semibold tracking-tight text-text">
                {PLAN_COPY.pro.name}
              </div>{" "}
              <div className="mt-2 text-sm text-muted">
                {PLAN_COPY.pro.description}
              </div>{" "}
            </div>{" "}
            {subscription.plan === "pro" ? (
              <PlanBadge plan="pro" status={subscription.status} />
            ) : null}{" "}
          </div>{" "}
          <div className="mt-6 space-y-3">
            {" "}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {" "}
              <PricingToggle
                onChange={setBillingCycle}
                value={billingCycle}
              />{" "}
              <div className="rounded-full border border-line bg-shell px-3 py-1 text-xs text-muted">
                {" "}
                Redirects to{" "}
                <span className="font-mono text-text">
                  projecto.adityakosuru.online/pricing
                </span>{" "}
              </div>{" "}
            </div>{" "}
            <div className="flex items-end gap-2">
              {" "}
              <span className="text-4xl font-semibold tracking-tight text-text">
                {selectedPricing.priceLabel}
              </span>{" "}
              <span className="pb-1 text-sm text-muted">
                {selectedPricing.cadenceLabel}
              </span>{" "}
              {selectedPricing.savingsLabel ? (
                <span className="pb-1 text-sm text-muted">
                  {selectedPricing.savingsLabel}
                </span>
              ) : null}{" "}
            </div>{" "}
            <div className="text-sm text-muted">
              {" "}
              {selectedPricing.helper}. Monthly and yearly subscriptions are
              both completed on your Projecto pricing page.{" "}
            </div>{" "}
          </div>{" "}
          <div className="mt-6 space-y-3">
            {" "}
            {PLAN_COPY.pro.features.map((feature) => (
              <div className="flex items-start gap-3" key={feature}>
                {" "}
                <div className="mt-1 h-2 w-2 rounded-full bg-accent" />{" "}
                <div className="text-sm text-text">{feature}</div>{" "}
              </div>
            ))}{" "}
          </div>{" "}
          <div className="mt-8 flex flex-wrap gap-3">
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
              {pro
                ? "Open billing page"
                : billingCycle === "yearly"
                  ? "Choose yearly in browser"
                  : "Choose monthly in browser"}{" "}
            </Button>{" "}
            {!subscription.email ? (
              <Button
                onClick={async () => {
                  try {
                    await startGoogleSignIn();
                  } catch (error) {
                    pushToast({
                      title: "Unable to start sign-in",
                      description:
                        error instanceof Error
                          ? error.message
                          : "Unknown sign-in error.",
                      tone: "error",
                    });
                  }
                }}
                variant="secondary"
              >
                {" "}
                Sign in with Projecto{" "}
              </Button>
            ) : (
              <div className="min-w-[280px] flex-1">
                {" "}
                <AccountIdentity subscription={subscription} />{" "}
              </div>
            )}{" "}
          </div>{" "}
        </PremiumCard>{" "}
      </div>{" "}
      <PremiumCard className="overflow-hidden p-0">
        {" "}
        <div className="grid grid-cols-[minmax(0,1.1fr)_180px_180px] border-b border-line px-6 py-4 text-[11px] uppercase tracking-[0.18em] text-muted">
          {" "}
          <div>Feature</div> <div>Standard</div> <div>Pro</div>{" "}
        </div>{" "}
        <div>
          {" "}
          {PRICING_MATRIX.map((row) => (
            <div
              className="grid grid-cols-[minmax(0,1.1fr)_180px_180px] items-center border-b border-line px-6 py-4 last:border-b-0"
              key={row.label}
            >
              {" "}
              <div className="text-sm font-medium text-text">
                {row.label}
              </div>{" "}
              <div className="text-sm text-muted">{row.free}</div>{" "}
              <div className="text-sm text-text">{row.pro}</div>{" "}
            </div>
          ))}{" "}
        </div>{" "}
      </PremiumCard>{" "}
      <div className="grid gap-4">
        {" "}
        <PremiumCard className="p-6">
          {" "}
          <div className="flex items-start gap-3">
            {" "}
            <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-shell text-text">
              {" "}
              <ShieldCheck className="h-4 w-4" />{" "}
            </div>{" "}
            <div className="min-w-0 flex-1">
              {" "}
              <div className="text-lg font-semibold text-text">
                Desktop subscription status
              </div>{" "}
              <div className="mt-2 text-sm leading-6 text-muted">
                {" "}
                Projecto verifies your plan through your hosted account. Payment
                details and checkout stay in the browser.{" "}
              </div>{" "}
              {latestEvent ? (
                <div className="mt-3 rounded-2xl border border-line bg-shell px-4 py-3 text-xs text-muted">
                  {" "}
                  Latest billing event:{" "}
                  <span className="font-semibold text-text">
                    {latestEvent.type}
                  </span>{" "}
                  {latestEvent.message ? ` - ${latestEvent.message}` : ""}{" "}
                </div>
              ) : null}{" "}
            </div>{" "}
          </div>{" "}
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {" "}
            <StatusItem
              label="Current access"
              value={
                pro
                  ? "Pro verified"
                  : reconnect
                    ? "Reconnect required"
                    : "Standard"
              }
            />{" "}
            <StatusItem
              label="Account"
              value={subscription.email ? accountDisplayName : "Not connected"}
            />{" "}
            <StatusItem
              label="Last verified"
              value={formatAbsoluteDate(subscription.lastVerifiedAt)}
            />{" "}
            <StatusItem
              label="Expires"
              value={formatAbsoluteDate(subscription.expiresAt)}
            />{" "}
            <StatusItem
              label="Hidden on Standard"
              value={String(subscription.archivedProjectCount ?? 0)}
            />{" "}
          </div>{" "}
          {subscription.email ? (
            <div className="mt-4">
              {" "}
              <AccountIdentity subscription={subscription} />{" "}
            </div>
          ) : null}{" "}
          {reconnect ? (
            <div className="mt-4 rounded-[24px] border border-line bg-shell p-4 text-sm text-muted">
              {" "}
              Projecto needs an online, signed-in session. Sign in on the web
              and refresh this device to unlock synced access.{" "}
            </div>
          ) : subscription.archivedProjectCount &&
            subscription.archivedProjectCount > 0 ? (
            <div className="mt-4 rounded-[24px] border border-line bg-shell p-4 text-sm text-muted">
              {" "}
              {subscription.archivedProjectCount} project
              {subscription.archivedProjectCount === 1 ? "" : "s"} are currently
              hidden on Standard. Upgrading to Pro restores them automatically.{" "}
            </div>
          ) : null}{" "}
        </PremiumCard>{" "}
      </div>{" "}
    </div>
  );
}
function StatusItem({
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
