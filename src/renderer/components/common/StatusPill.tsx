import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
type StatusTone = "neutral" | "success" | "warning" | "danger";
const toneClasses: Record<StatusTone, string> = {
  neutral: "app-status-neutral",
  success: "app-status-success",
  warning: "app-status-warning",
  danger: "app-status-danger",
};
export function StatusPill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
}): JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.14em]",
        toneClasses[tone],
        className,
      )}
    >
      {" "}
      {children}{" "}
    </span>
  );
}
