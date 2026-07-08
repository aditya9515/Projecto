import type { SubscriptionState } from "../../../main/types/shared";
import { getAccountDisplayName, getAccountInitials } from "../../utils/account";
import { PlanBadge } from "./PlanBadge";
type AccountIdentityProps = {
  subscription: SubscriptionState;
  compact?: boolean;
};
export function AccountIdentity({
  subscription,
  compact = false,
}: AccountIdentityProps): JSX.Element | null {
  if (!subscription.email) {
    return null;
  }
  const displayName = getAccountDisplayName(subscription);
  const initials = getAccountInitials(subscription);
  return (
    <div
      className={`rounded-2xl border border-line bg-panel ${compact ? "px-3 py-3" : "px-4 py-4"}`}
    >
      {" "}
      <div
        className={`flex ${compact ? "justify-center" : "items-center gap-3"}`}
      >
        {" "}
        <div className="app-icon-surface flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-sm font-semibold uppercase tracking-[0.14em]">
          {" "}
          {initials}{" "}
        </div>{" "}
        {!compact ? (
          <div className="min-w-0 flex-1">
            {" "}
            <div className="truncate text-sm font-semibold text-text">
              {displayName}
            </div>{" "}
            <div className="truncate text-xs text-muted">
              {subscription.email}
            </div>{" "}
          </div>
        ) : null}{" "}
        {!compact ? (
          <PlanBadge
            className="shrink-0"
            plan={subscription.plan}
            status={subscription.status}
          />
        ) : null}{" "}
      </div>{" "}
      {compact ? (
        <div className="mt-3 flex justify-center">
          {" "}
          <PlanBadge
            plan={subscription.plan}
            status={subscription.status}
          />{" "}
        </div>
      ) : null}{" "}
    </div>
  );
}
