import type { Project, SubscriptionState } from "../main/types/shared";
import { FREE_LIMITS } from "./pricing";

export const upgradeReasonValues = [
  "projects",
  "concurrentLaunches",
  "bulkImport",
  "workspacePresets",
  "directoryChanges",
  "standardLaunch",
  "lockedProject",
] as const;

export type UpgradeReason = (typeof upgradeReasonValues)[number];

export const UPGRADE_ERROR_PREFIX = "UPGRADE_REQUIRED:";

export type UpgradeReasonCopy = {
  title: string;
  description: string;
  featureBullets: string[];
};

const reasonCopy: Record<UpgradeReason, UpgradeReasonCopy> = {
  projects: {
    title: "Unlock Unlimited Projects",
    description:
      "Standard includes up to 5 synced project directories. Pro removes the cap and keeps your workspace flexible across devices.",
    featureBullets: [
      "Unlimited projects",
      "Unlimited concurrent launches",
      "Bulk import and advanced tooling",
    ],
  },
  concurrentLaunches: {
    title: "Launch Multiple Projects With Pro",
    description:
      "Standard can launch one project workflow at a time. Pro removes the concurrency cap for heavier multi-project setups.",
    featureBullets: [
      "Unlimited concurrent launches",
      "Better for fullstack workspaces",
      "Faster switching between environments",
    ],
  },
  bulkImport: {
    title: "Bulk Import Is a Pro Workflow",
    description:
      "Bulk import and bulk scan are available on Pro for larger workspaces and faster onboarding.",
    featureBullets: [
      "Smart bulk import",
      "Bulk scan entire workspaces",
      "Best for monorepos and client folders",
    ],
  },
  workspacePresets: {
    title: "Workspace Presets Are Pro",
    description:
      "Use premium presets to generate polished launch workflows in one click.",
    featureBullets: [
      "Advanced launch presets",
      "One-click setup",
      "Better team consistency",
    ],
  },
  directoryChanges: {
    title: "Directory Update Blocked",
    description:
      "Projecto could not sync that directory update right now. Refresh your subscription state and try again.",
    featureBullets: [
      "Refresh desktop subscription state",
      "Retry after reconnecting to the backend",
      "Project directory edits are included on Standard and Pro",
    ],
  },
  standardLaunch: {
    title: "Upgrade From Standard",
    description:
      "Standard keeps Projecto focused: 5 project directories, basic detection, one active launch, and no bulk import. Pro unlocks the full workspace again.",
    featureBullets: [
      "Unlimited projects",
      "Unlimited concurrent launches",
      "Advanced detection and bulk import",
      "Locked Standard projects unlock automatically after Pro is active",
    ],
  },
  lockedProject: {
    title: "This Project Is Locked On Standard",
    description:
      "Standard keeps your 5 most-used projects runnable. This project stays visible and removable, but launching it requires Pro.",
    featureBullets: [
      "Upgrade to unlock every project",
      "Delete projects you no longer need to free a Standard slot",
      "Project files on disk are never deleted by Projecto",
    ],
  },
};

export function needsReconnect(subscription: SubscriptionState): boolean {
  return !subscription.email;
}

export function isProPlan(subscription: SubscriptionState): boolean {
  return subscription.plan === "pro" && subscription.status === "active";
}

export function getPlanDisplayName(plan: SubscriptionState["plan"]): string {
  return plan === "pro" ? "Pro" : "Standard";
}

export function isStandardAccess(subscription: SubscriptionState): boolean {
  return !isProPlan(subscription);
}

export function getProjectLimit(subscription: SubscriptionState): number | null {
  if (isProPlan(subscription)) {
    return subscription.entitlements?.maxProjects ?? null;
  }
  return subscription.entitlements?.maxProjects ?? FREE_LIMITS.projects;
}

export function canCreateProject(
  subscription: SubscriptionState,
  currentProjectCount: number,
): boolean {
  const maxProjects = getProjectLimit(subscription);
  return maxProjects === null || currentProjectCount < maxProjects;
}

export function canCreateLaunchProfile(): boolean {
  return true;
}

export function canUseBulkImport(subscription: SubscriptionState): boolean {
  if (isProPlan(subscription)) {
    return true;
  }
  return (
    subscription.entitlements?.canBulkImport === true &&
    subscription.entitlements?.canBulkScan === true
  );
}

export function canUseWorkspacePresets(
  subscription: SubscriptionState,
): boolean {
  return isProPlan(subscription);
}

export function canChangeProjectDirectories(
  subscription: SubscriptionState,
): boolean {
  return subscription.entitlements?.canChangeProjectDirectories === true;
}

export function getMaxConcurrentLaunches(
  subscription: SubscriptionState,
): number | null {
  if (isProPlan(subscription)) {
    return subscription.entitlements?.maxConcurrentLaunches ?? null;
  }
  return subscription.entitlements?.maxConcurrentLaunches ?? 1;
}

export function compareProjectsByStandardUsage(
  left: Pick<
    Project,
    "id" | "name" | "launchCount" | "lastOpenedAt" | "updatedAt" | "createdAt"
  >,
  right: Pick<
    Project,
    "id" | "name" | "launchCount" | "lastOpenedAt" | "updatedAt" | "createdAt"
  >,
): number {
  if (left.launchCount !== right.launchCount) {
    return right.launchCount - left.launchCount;
  }

  const leftRecency = left.lastOpenedAt ?? left.updatedAt ?? left.createdAt;
  const rightRecency = right.lastOpenedAt ?? right.updatedAt ?? right.createdAt;

  if (leftRecency !== rightRecency) {
    return rightRecency.localeCompare(leftRecency);
  }

  const nameComparison = left.name.localeCompare(right.name);

  return nameComparison !== 0 ? nameComparison : left.id.localeCompare(right.id);
}

export function applySubscriptionProjectAccess(
  projects: Project[],
  subscription: SubscriptionState,
): Project[] {
  const projectLimit = getProjectLimit(subscription);

  if (projectLimit === null || !isStandardAccess(subscription)) {
    return projects.map((project) => ({
      ...project,
      lockedBySubscription: false,
      subscriptionLockReason: undefined,
      subscriptionRank: undefined,
      subscriptionLimit: undefined,
    }));
  }

  const ranks = new Map(
    [...projects]
      .sort(compareProjectsByStandardUsage)
      .map((project, index) => [project.id, index + 1]),
  );

  return projects.map((project) => {
    const rank = ranks.get(project.id);
    const locked = rank !== undefined && rank > projectLimit;

    return {
      ...project,
      lockedBySubscription: locked,
      subscriptionLockReason: locked ? "standard_project_limit" : undefined,
      subscriptionRank: rank,
      subscriptionLimit: projectLimit,
    };
  });
}

export function isProjectLockedBySubscription(project: Project): boolean {
  return project.lockedBySubscription === true;
}

export function createUpgradeRequiredError(reason: UpgradeReason): Error {
  return new Error(`${UPGRADE_ERROR_PREFIX}${reason}`);
}

export function parseUpgradeReason(error: unknown): UpgradeReason | null {
  if (!(error instanceof Error)) {
    return null;
  }

  if (!error.message.startsWith(UPGRADE_ERROR_PREFIX)) {
    return null;
  }

  const reason = error.message.slice(UPGRADE_ERROR_PREFIX.length);
  return upgradeReasonValues.includes(reason as UpgradeReason)
    ? (reason as UpgradeReason)
    : null;
}

export function getUpgradeReasonCopy(reason: UpgradeReason): UpgradeReasonCopy {
  return reasonCopy[reason];
}
