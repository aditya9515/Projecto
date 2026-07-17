import type {
  CommandSafetySummary,
  Project,
  RunEvent,
} from "../../main/types/shared";
import { isProjectLockedBySubscription } from "../../billing/upgradeGate";
import type { ProjectHealthStatus } from "../types/projectHealth";
import { getDefaultProfile, getRunnableProfileCommands } from "./launch";

export type ProjectHealthInput = {
  project: Project;
  recentLaunchFailures?: RunEvent[];
  commandSafety?: CommandSafetySummary[];
};

export function getProjectHealthStatus({
  project,
  recentLaunchFailures = [],
  commandSafety = [],
}: ProjectHealthInput): ProjectHealthStatus {
  if (isProjectLockedBySubscription(project)) {
    return "locked";
  }
  if (project.missingFolder) {
    return "missing-folder";
  }

  const defaultProfile = getDefaultProfile(project);
  if (!defaultProfile) {
    return "no-launch-profile";
  }
  if (recentLaunchFailures.some((event) => event.projectId === project.id)) {
    return "command-failed";
  }

  const runnableCommandIds = new Set(
    getRunnableProfileCommands(project, defaultProfile).map(
      (command) => command.id,
    ),
  );
  const unapprovedRuntimeCommand = commandSafety.some(
    (summary) => runnableCommandIds.has(summary.commandId) && !summary.approved,
  );

  if (unapprovedRuntimeCommand) {
    return "approval-required";
  }

  return "ready";
}

export const projectHealthCopy: Record<
  ProjectHealthStatus,
  { label: string; description: string }
> = {
  ready: { label: "Ready", description: "Projecto can launch this project." },
  locked: {
    label: "Locked",
    description: "This project needs Plus before it can launch.",
  },
  "missing-folder": {
    label: "Missing folder",
    description: "The local directory is no longer available on this device.",
  },
  "no-launch-profile": {
    label: "No launch profile",
    description: "Create a launch profile before one-click launch.",
  },
  "approval-required": {
    label: "Approval required",
    description: "Runtime commands need first-run approval.",
  },
  "sync-conflict": {
    label: "Sync attention",
    description: "Project metadata needs a sync repair action.",
  },
  "command-failed": {
    label: "Last command failed",
    description: "Review run logs or edit the failing command.",
  },
};