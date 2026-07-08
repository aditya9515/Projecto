import type { DetectedType } from "../../../main/types/shared";
const badgeStyles: Record<DetectedType, string> = {
  node: "app-status-neutral",
  python: "app-status-neutral",
  docker: "app-status-neutral",
  rust: "app-status-neutral",
  fullstack: "app-status-warning",
  unknown: "app-status-neutral",
};
type StackBadgeProps = { detectedType: DetectedType; framework?: string };
export function StackBadge({
  detectedType,
  framework,
}: StackBadgeProps): JSX.Element {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${badgeStyles[detectedType]}`}
    >
      {" "}
      {framework ?? detectedType}{" "}
    </span>
  );
}
