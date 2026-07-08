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
  switch (session?.terminalStrategy) {
    case "os-internal":
    case "os-external":
      return "OS Terminal";
    case "vscode-internal":
    case "vscode-external":
      return "VS Code Terminal";
    default:
      return "OS Terminal";
  }
}
export function isVscodeTerminalStrategy(
  terminalStrategy?: TerminalStrategy,
): boolean {
  return (
    terminalStrategy === "vscode-internal" ||
    terminalStrategy === "vscode-external"
  );
}
export function formatTerminalControlLabel(
  terminalStrategy?: TerminalStrategy,
  managed?: boolean,
): string {
  if (terminalStrategy === "os-internal" || terminalStrategy === "os-external") {
    return managed === false ? "OS terminal" : "Projecto terminal";
  }
  if (
    terminalStrategy === "vscode-internal" ||
    terminalStrategy === "vscode-external"
  ) {
    return "VS Code terminal";
  }
  return "Projecto terminal";
}
