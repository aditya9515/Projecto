import { Crown, ShieldCheck, Sparkles } from "lucide-react";
import type { SubscriptionState } from "../../../main/types/shared";
import { isProPlan, needsReconnect } from "../../../billing/upgradeGate";
import { Button } from "./Button";
import { PlanBadge } from "./PlanBadge";
type SubscriptionBannerProps = {
  subscription: SubscriptionState;
  onUpgrade: () => void;
  onOpenBilling: () => void;
};
export function SubscriptionBanner({
  subscription,
  onUpgrade,
  onOpenBilling,
}: SubscriptionBannerProps): JSX.Element {
  const pro = isProPlan(subscription);
  const reconnect = needsReconnect(subscription);
  return (
    <div className="app-neutral-highlight flex flex-col gap-4 rounded-[24px] border border-line px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      {" "}
      <div className="space-y-2">
        {" "}
        <div className="flex items-center gap-3">
          {" "}
          <PlanBadge
            plan={subscription.plan}
            status={subscription.status}
          />{" "}
          {pro ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              {" "}
              <ShieldCheck className="h-3.5 w-3.5" /> Verified Pro access{" "}
            </span>
          ) : reconnect ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              {" "}
              <ShieldCheck className="h-3.5 w-3.5" /> Sign in to sync desktop
              access{" "}
            </span>
          ) : subscription.plan === "pro" ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              {" "}
              <Crown className="h-3.5 w-3.5" /> Web billing account linked{" "}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              {" "}
              <Sparkles className="h-3.5 w-3.5" /> Standard plan limits apply{" "}
            </span>
          )}{" "}
        </div>{" "}
        <div>
          {" "}
          <div className="text-base font-semibold text-text">
            {" "}
            {pro
              ? "Pro access is active on this device."
              : reconnect
                ? "Sign in with Projecto to sync this desktop workspace."
                : "Upgrade on the web to unlock the full Projecto workspace."}{" "}
          </div>{" "}
          <div className="text-sm text-muted">
            {" "}
            {pro
              ? subscription.email
                ? `Signed in as ${subscription.email}. Refresh anytime to keep this device in sync.`
                : "Refresh anytime from Billing to keep desktop access in sync."
              : reconnect
                ? "Projecto uses your online account to verify access and sync project directories."
                : "Get unlimited projects, unlimited launches, advanced detection, and bulk import."}{" "}
          </div>{" "}
        </div>{" "}
      </div>{" "}
      <div className="flex flex-wrap gap-2">
        {" "}
        {!pro ? (
          <Button onClick={onUpgrade} variant="primary">
            {" "}
            Upgrade to Pro{" "}
          </Button>
        ) : null}{" "}
        <Button onClick={onOpenBilling} variant="secondary">
          {" "}
          Billing Status{" "}
        </Button>{" "}
      </div>{" "}
    </div>
  );
}
