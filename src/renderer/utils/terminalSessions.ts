import type {
  Project,
  ProjectTerminalSession,
  TerminalStrategy,
} from "../../main/types/shared";
import { isProjectLockedBySubscription } from "../../billing/upgradeGate";

export type ProjectLaunchButtonState =
  | "launch"
  | "locked"
  | "running"
  | "ready"
  | "stopping"
  | "failed"
  | "disabled";

export function getProjectLaunchButtonState(
  project: Project,
  session?: ProjectTerminalSession,
): ProjectLaunchButtonState {
  if (isProjectLockedBySubscription(project)) {
    return "locked";
  }
  if (project.missingFolder || project.launchProfiles.length === 0) {
    return "disabled";
  }
  if (!session) {
    return "launch";
  }
  if (session.status === "ready") {
    return "ready";
  }
  if (session.status === "stopping") {
    return "stopping";
  }
  if (session.status === "failed") {
    return "failed";
  }
  if (session.status === "running") {
    return "running";
  }
  return "launch";
}

export function formatTerminalStrategyLabel(
  session?:
    | Pick<ProjectTerminalSession, "terminalStrategy">
    | { terminalStrategy?: TerminalStrategy },
): string {
  void session;
  return "Windows Terminal";
}

export function formatTerminalControlLabel(
  terminalStrategy?: TerminalStrategy,
  managed?: boolean,
): string {
  void terminalStrategy;
  void managed;
  return "Windows Terminal";
}