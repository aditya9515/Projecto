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
}: PlanBadgeProps): JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
        plan === "pro" ? "app-status-success" : "app-status-neutral",
        className,
      )}
    >
      <span>{getPlanDisplayName(plan)}</span>
      {status && status !== "none" ? (
        <span>{status}</span>
      ) : null}
    </span>
  );
}
