import type { ProjectHealthStatus } from "../../types/projectHealth";
import { projectHealthCopy } from "../../utils/projectHealth";
import { StatusPill } from "../common/StatusPill";
function toneForStatus(
  status: ProjectHealthStatus,
): "success" | "warning" | "danger" | "neutral" {
  if (status === "ready") {
    return "success";
  }
  if (status === "missing-folder" || status === "command-failed") {
    return "danger";
  }
  if (
    status === "locked" ||
    status === "no-launch-profile" ||
    status === "approval-required" ||
    status === "sync-conflict"
  ) {
    return "warning";
  }
  return "neutral";
}
export function ProjectHealthBadge({
  status,
}: {
  status: ProjectHealthStatus;
}): JSX.Element {
  return (
    <StatusPill tone={toneForStatus(status)}>
      {projectHealthCopy[status].label}
    </StatusPill>
  );
}
