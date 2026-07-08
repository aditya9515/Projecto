import type { RunStatus } from "../../../main/types/shared";
import { StatusPill } from "../common/StatusPill";
export function RunStatusBadge({ status }: { status: RunStatus }): JSX.Element {
  const tone =
    status === "completed" || status === "ready"
      ? "success"
      : status === "failed"
        ? "danger"
        : status === "stopped"
          ? "warning"
          : "neutral";
  return <StatusPill tone={tone}>{status}</StatusPill>;
}
