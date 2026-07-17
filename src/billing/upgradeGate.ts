import type { Project, SubscriptionState } from "../main/types/shared";
import { FREE_LIMITS } from "./pricing";

export const upgradeReasonValues = [
  "projects",
  "concurrentLaunches",
  "bulkImport",
  "workspacePresets",
  "directoryChanges",
  "freeLaunch",
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
      "Free includes up to 5 synced project directories. Plus removes the cap for larger workspaces.",
    featureBullets: [
      "Unlimited projects",
      "Unlimited concurrent launches",
      "Bulk import and advanced tooling",
    ],
  },
  concurrentLaunches: {
    title: "Launch Limit Is 1 On The Free Tier",
    description:
      "The free tier allows one active project launch at a time. Stop the current launch, clear any stale session, or upgrade to Plus for unlimited concurrent launches.",
    featureBullets: [
      "Unlimited concurrent launches",
      "Better for fullstack workspaces",
      "Faster switching between environments",
    ],
  },
  bulkImport: {
    title: "Bulk Import Is Plus",
    description:
      "Bulk import and bulk scan are available on Plus for larger workspaces and faster onboarding.",
    featureBullets: [
      "Smart bulk import",
      "Bulk scan entire workspaces",
      "Best for monorepos and client folders",
    ],
  },
  workspacePresets: {
    title: "Workspace Presets Need Plus",
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
      "Project directory edits are included on Free and Plus",
    ],
  },
  freeLaunch: {
    title: "Upgrade To Plus",
    description:
      "Free includes 5 projects, basic detection, 1 active launch, and no bulk import. Plus unlocks the full workspace.",
    featureBullets: [
      "Unlimited projects",
      "Unlimited concurrent launches",
      "Advanced detection and bulk import",
      "Locked projects unlock automatically after Plus is active",
    ],
  },
  lockedProject: {
    title: "This Project Is Locked",
    description:
      "Your 5 most-used projects stay runnable on Free. This project stays visible and removable, but launching it requires Plus.",
    featureBullets: [
      "Upgrade to unlock every project",
      "Delete projects you no longer need to free a slot",
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
  return plan === "pro" ? "Plus" : "Free";
}

export function isFreeAccess(subscription: SubscriptionState): boolean {
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

export function compareProjectsByFreeUsage(
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

  if (projectLimit === null || !isFreeAccess(subscription)) {
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
      .sort(compareProjectsByFreeUsage)
      .map((project, index) => [project.id, index + 1]),
  );

  return projects.map((project) => {
    const rank = ranks.get(project.id);
    const locked = rank !== undefined && rank > projectLimit;

    return {
      ...project,
      lockedBySubscription: locked,
      subscriptionLockReason: locked ? "free_project_limit" : undefined,
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
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : null;

  if (!message) {
    return null;
  }

  const prefixIndex = message.indexOf(UPGRADE_ERROR_PREFIX);

  if (prefixIndex === -1) {
    return null;
  }

  const reasonText = message.slice(prefixIndex + UPGRADE_ERROR_PREFIX.length);
  const reason = upgradeReasonValues.find(
    (value) =>
      reasonText === value ||
      reasonText.startsWith(`${value}:`) ||
      reasonText.startsWith(`${value} `) ||
      reasonText.startsWith(`${value}\n`) ||
      reasonText.startsWith(`${value}\r`),
  );

  return reason ?? null;
}

export function getUpgradeReasonCopy(reason: UpgradeReason): UpgradeReasonCopy {
  return reasonCopy[reason];
}
