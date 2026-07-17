import type {
  SubscriptionPlan,
  SubscriptionStatus,
} from "../../../main/types/shared";
import { getPlanDisplayName } from "../../../billing/upgradeGate";
import { cn } from "../../utils/cn";

type PlanBadgeProps = {
  plan: SubscriptionPlan;
  status?: SubscriptionStatus;
  className?: string;
};

export function PlanBadge({
  plan,
  status,
  className,
}: PlanBadgeProps): JSX.Element | null {
  void status;

  if (plan !== "pro") {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] app-status-success",
        className,
      )}
    >
      {getPlanDisplayName(plan)}
    </span>
  );
}