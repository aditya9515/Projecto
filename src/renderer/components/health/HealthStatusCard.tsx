import type { ReactNode } from "react";
import { PremiumCard } from "../common/PremiumCard";
import { StatusPill } from "../common/StatusPill";
type HealthTone = "success" | "warning" | "danger" | "neutral";
export function HealthStatusCard({
  title,
  value,
  description,
  tone = "neutral",
  action,
}: {
  title: string;
  value: string;
  description?: string;
  tone?: HealthTone;
  action?: ReactNode;
}): JSX.Element {
  return (
    <PremiumCard className="min-w-0 p-5">
      {" "}
      <div className="flex min-w-0 items-start justify-between gap-3">
        {" "}
        <div className="min-w-0 break-words text-[11px] uppercase tracking-[0.18em] text-muted">
          {title}
        </div>{" "}
        <StatusPill className="shrink-0 whitespace-nowrap" tone={tone}>
          {tone}
        </StatusPill>{" "}
      </div>{" "}
      <div className="mt-3 min-w-0 break-words text-lg font-semibold leading-7 text-text">
        {value}
      </div>{" "}
      {description ? (
        <p className="mt-3 min-w-0 break-words text-sm leading-6 text-muted">
          {description}
        </p>
      ) : null}{" "}
      {action ? <div className="mt-4">{action}</div> : null}{" "}
    </PremiumCard>
  );
}
