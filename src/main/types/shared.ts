import { z } from "zod";

export const detectedTypeValues = [
  "node",
  "python",
  "docker",
  "rust",
  "fullstack",
  "unknown",
] as const;
export const editorValues = ["vscode"] as const;
export const terminalStrategyValues = ["os-external"] as const;
export const runStatusValues = [
  "started",
  "running",
  "spawned",
  "ready",
  "completed",
  "failed",
  "stopped",
] as const;
export const terminalSessionStatusValues = [
  "running",
  "ready",
  "stopping",
  "failed",
  "stopped",
] as const;
export const projectLaunchPortSourceValues = [
  "local",
  "network",
  "generic",
  "configured",
  "port-remap",
] as const;
export const runEventKindValues = [
  "stdout",
  "stderr",
  "system",
  "status",
  "url-detected",
  "port-remapped",
  "already-running",
] as const;
export const planValues = ["free", "pro"] as const;
export const subscriptionStatusValues = [
  "none",
  "active",
  "expired",
  "cancelled",
  "disabled",
] as const;
export const billingCycleValues = ["monthly", "yearly"] as const;
export const detectionLevelValues = ["basic", "advanced"] as const;
export const projectStorageValues = ["firestore"] as const;
export const projectSubscriptionLockReasonValues = [
  "free_project_limit",
] as const;
export const billingEventTypeValues = [
  "upgrade-opened",
  "auth-started",
  "auth-completed",
  "auth-failed",
  "subscription-updated",
  "subscription-refresh-failed",
] as const;
export const activityKindValues = [
  "project-imported",
  "launch-profile",
  "run-command",
] as const;
export const bridgeStatusValues = [
  "starting",
  "connected",
  "waiting",
  "stopped",
  "error",
] as const;
export const commandRiskValues = ["safe", "medium", "dangerous"] as const;
export const desktopUpdateStatusValues = [
  "idle",
  "checking",
  "available",
  "downloading",
  "ready",
  "installing",
  "unavailable",
  "error",
] as const;

export type DetectedType = (typeof detectedTypeValues)[number];
export type TerminalStrategy = (typeof terminalStrategyValues)[number];
export type RunStatus = (typeof runStatusValues)[number];
export type TerminalSessionStatus =
  (typeof terminalSessionStatusValues)[number];
export type ProjectLaunchPortSource =
  (typeof projectLaunchPortSourceValues)[number];
export type RunEventKind = (typeof runEventKindValues)[number];
export type SubscriptionPlan = (typeof planValues)[number];
export type SubscriptionStatus = (typeof subscriptionStatusValues)[number];
export type BillingCycle = (typeof billingCycleValues)[number];
export type ProjectDetectionLevel = (typeof detectionLevelValues)[number];
export type ProjectStorage = (typeof projectStorageValues)[number];
export type ProjectSubscriptionLockReason =
  (typeof projectSubscriptionLockReasonValues)[number];
export type BillingEventType = (typeof billingEventTypeValues)[number];
export type ActivityKind = (typeof activityKindValues)[number];
export type BridgeStatus = (typeof bridgeStatusValues)[number];
export type CommandRisk = (typeof commandRiskValues)[number];
export type DesktopUpdateStatus = (typeof desktopUpdateStatusValues)[number];

export const SuggestedCommandSchema = z.object({
  label: z.string().trim().min(1).max(120),
  command: z.string().trim().min(1).max(5_000),
  cwd: z.string().trim().min(1),
});

export const LaunchCommandSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(120),
  command: z.string().trim().min(1).max(5_000),
  cwd: z.string().trim().min(1),
  runOnLaunch: z.boolean(),
});

export const LaunchProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  openEditor: z.boolean(),
  openFolder: z.boolean(),
  openBrowser: z.boolean(),
  browserUrls: z.array(z.string().url()).default([]),
  commandIds: z.array(z.string().min(1)).default([]),
  askBeforeRun: z.boolean(),
});

export const DetectionResultSchema = z.object({
  detectedType: z.enum(detectedTypeValues),
  framework: z.string().trim().min(1).optional(),
  packageManager: z.string().trim().min(1).optional(),
  detectedFiles: z.array(z.string().trim().min(1)).default([]),
  suggestedCommands: z.array(SuggestedCommandSchema).default([]),
  suggestedBrowserUrls: z.array(z.string().url()).default([]),
});

export const BulkImportCandidateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  path: z.string().trim().min(1),
  detection: DetectionResultSchema,
});

export const ProjectRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  path: z.string().trim().min(1),
  detectedType: z.enum(detectedTypeValues),
  framework: z.string().trim().min(1).optional(),
  packageManager: z.string().trim().min(1).optional(),
  detectedFiles: z.array(z.string().trim().min(1)).default([]),
  suggestedCommands: z.array(SuggestedCommandSchema).default([]),
  suggestedBrowserUrls: z.array(z.string().url()).default([]),
  launchProfiles: z.array(LaunchProfileSchema).default([]),
  commands: z.array(LaunchCommandSchema).default([]),
  notes: z.string().default(""),
  favorite: z.boolean().default(false),
  launchCount: z.number().int().nonnegative().default(0),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  lastOpenedAt: z.string().min(1).optional(),
});

export const ProjectSchema = ProjectRecordSchema.extend({
  missingFolder: z.boolean().optional(),
  lockedBySubscription: z.boolean().optional(),
  subscriptionLockReason: z
    .enum(projectSubscriptionLockReasonValues)
    .optional(),
  subscriptionRank: z.number().int().positive().optional(),
  subscriptionLimit: z.number().int().positive().optional(),
});

export const CreateProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  path: z.string().trim().min(1),
  detectedType: z.enum(detectedTypeValues),
  framework: z.string().trim().min(1).optional(),
  packageManager: z.string().trim().min(1).optional(),
  detectedFiles: z.array(z.string().trim().min(1)).default([]),
  suggestedCommands: z.array(SuggestedCommandSchema).default([]),
  suggestedBrowserUrls: z.array(z.string().url()).default([]),
  commands: z.array(LaunchCommandSchema).optional(),
  launchProfiles: z.array(LaunchProfileSchema).optional(),
  notes: z.string().optional(),
  favorite: z.boolean().optional(),
});

export const ProjectUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    path: z.string().trim().min(1).optional(),
    detectedType: z.enum(detectedTypeValues).optional(),
    framework: z.string().trim().min(1).optional(),
    packageManager: z.string().trim().min(1).optional(),
    detectedFiles: z.array(z.string().trim().min(1)).optional(),
    suggestedCommands: z.array(SuggestedCommandSchema).optional(),
    suggestedBrowserUrls: z.array(z.string().url()).optional(),
    launchProfiles: z.array(LaunchProfileSchema).optional(),
    commands: z.array(LaunchCommandSchema).optional(),
    notes: z.string().optional(),
    favorite: z.boolean().optional(),
    launchCount: z.number().int().nonnegative().optional(),
    lastOpenedAt: z.string().nullable().optional(),
  })
  .strict();

export const AppSettingsSchema = z.object({
  defaultEditor: z.enum(editorValues),
  terminalStrategy: z.enum(terminalStrategyValues),
  telemetryEnabled: z.boolean(),
  askBeforeRunningNewCommands: z.boolean(),
  launchOnStartup: z.boolean(),
  hasCompletedOnboarding: z.boolean(),
});

export const AppSettingsUpdateSchema = AppSettingsSchema.partial().strict();

export const DesktopEntitlementsSchema = z.object({
  maxProjects: z.number().int().positive().nullable(),
  canChangeProjectDirectories: z.boolean(),
  maxConcurrentLaunches: z.number().int().positive().nullable(),
  canBulkImport: z.boolean(),
  canBulkScan: z.boolean(),
  projectStorage: z.enum(projectStorageValues),
  requiresOnline: z.literal(true),
  projectDetectionLevel: z.enum(detectionLevelValues),
  defaultDirectoryLimit: z.number().int().positive().nullable(),
  canChangeDefaultDirectories: z.boolean(),
});

export const SubscriptionStateSchema = z.object({
  plan: z.enum(planValues),
  status: z.enum(subscriptionStatusValues),
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
  expiresAt: z.string().min(1).optional(),
  currentPeriodEnd: z.string().min(1).nullable().optional(),
  currentPeriodStart: z.string().min(1).nullable().optional(),
  rawStatus: z.string().min(1).optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
  billingCycle: z.enum(billingCycleValues).optional(),
  lastVerifiedAt: z.string().min(1).optional(),
  archivedProjectCount: z.number().int().nonnegative().optional(),
  entitlements: DesktopEntitlementsSchema.optional(),
});

export const BillingEventSchema = z.object({
  type: z.enum(billingEventTypeValues),
  message: z.string().optional(),
  silent: z.boolean().optional(),
  subscription: SubscriptionStateSchema.optional(),
});

export const LaunchResultSchema = z.object({
  launchId: z.string().min(1),
  profileId: z.string().min(1),
  commandRunIds: z.array(z.string().min(1)).default([]),
  status: z.enum(runStatusValues),
});

export const CommandRunResultSchema = z.object({
  runId: z.string().min(1),
  commandId: z.string().min(1),
  status: z.enum(runStatusValues),
  executionMode: z.enum(terminalStrategyValues).optional(),
  managed: z.boolean().optional(),
});

export const RunEventSchema = z.object({
  runId: z.string().min(1),
  projectId: z.string().min(1),
  launchId: z.string().min(1).optional(),
  profileId: z.string().min(1).optional(),
  commandId: z.string().min(1).optional(),
  kind: z.enum(runEventKindValues),
  status: z.enum(runStatusValues).optional(),
  message: z.string(),
  timestamp: z.string().min(1),
  exitCode: z.number().nullable().optional(),
  url: z.string().url().optional(),
  fromPort: z.string().min(1).optional(),
  toPort: z.string().min(1).optional(),
  processId: z.string().min(1).optional(),
  executionMode: z.enum(terminalStrategyValues).optional(),
  managed: z.boolean().optional(),
});

export const ProjectLaunchPortSchema = z.object({
  port: z.number().int().min(1).max(65_535),
  host: z.string().min(1),
  url: z.string().url().optional(),
  source: z.enum(projectLaunchPortSourceValues),
  runId: z.string().min(1).optional(),
  projectId: z.string().min(1),
  detectedAt: z.string().min(1),
});

export const ProjectTerminalSessionSchema = z.object({
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  projectPath: z.string().min(1),
  launchId: z.string().min(1).optional(),
  profileId: z.string().min(1).optional(),
  activeRunId: z.string().min(1).optional(),
  runIds: z.array(z.string().min(1)).default([]),
  terminalStrategy: z.enum(terminalStrategyValues),
  status: z.enum(terminalSessionStatusValues),
  detectedUrls: z.array(z.string().url()).default([]),
  detectedPorts: z.array(ProjectLaunchPortSchema).default([]),
  terminalTitle: z.string().min(1).optional(),
  lastMessage: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const ActivityItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(activityKindValues),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(320).optional(),
  projectId: z.string().min(1).optional(),
  occurredAt: z.string().min(1),
});

export const UsageStatsSchema = z.object({
  launchesToday: z.number().int().nonnegative(),
  mostUsedProjectId: z.string().min(1).optional(),
  favoriteStack: z.enum(detectedTypeValues).optional(),
  recentActivity: z.array(ActivityItemSchema).default([]),
});

export const DesktopBridgeStateSchema = z.object({
  status: z.enum(bridgeStatusValues),
  host: z.literal("127.0.0.1"),
  port: z.number().int().min(1).max(65_535).optional(),
  protocolVersion: z.string().min(1),
  extensionConnected: z.boolean(),
  registeredWorkspaceCount: z.number().int().nonnegative(),
  lastError: z.string().optional(),
});

export const CommandSafetySummarySchema = z.object({
  commandId: z.string().min(1),
  label: z.string().min(1),
  command: z.string().min(1),
  cwd: z.string().min(1),
  risk: z.enum(commandRiskValues),
  approved: z.boolean(),
});


export const RunningPortSchema = z.object({
  protocol: z.string().min(1),
  localAddress: z.string().min(1),
  port: z.number().int().min(1).max(65_535),
  state: z.string().min(1),
  pid: z.number().int().nonnegative().optional(),
  processName: z.string().min(1).optional(),
});
export const DiagnosticCheckResultSchema = z.object({
  ok: z.boolean(),
  label: z.string().min(1),
  message: z.string().min(1),
  details: z.string().optional(),
});

export const DiagnosticsReportSchema = z.object({
  generatedAt: z.string().min(1),
  appName: z.string().min(1),
  appVersion: z.string().min(1),
  platform: z.string().min(1),
  arch: z.string().min(1),
  userDataPath: z.string().min(1),
  protocolVersion: z.string().min(1),
  bridge: DesktopBridgeStateSchema,
  settings: AppSettingsSchema,
  subscription: SubscriptionStateSchema,
  projectCount: z.number().int().nonnegative(),
  recentLaunchFailures: z.array(RunEventSchema).default([]),
  notes: z.array(z.string()).default([]),
});

export const ExportRunLogsInputSchema = z.object({
  runId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  content: z.string(),
});

export const DesktopUpdateStateSchema = z.object({
  status: z.enum(desktopUpdateStatusValues),
  currentVersion: z.string().min(1),
  updateAvailable: z.boolean(),
  latestVersion: z.string().min(1).optional(),
  releaseNotes: z.string().optional(),
  releaseDate: z.string().optional(),
  feedUrl: z.string().url().optional(),
  setupUrl: z.string().url().optional(),
  setupFileName: z.string().min(1).optional(),
  setupSha256: z.string().min(1).optional(),
  setupSize: z.string().min(1).optional(),
  mandatory: z.boolean().optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  message: z.string().optional(),
  error: z.string().optional(),
  checkedAt: z.string().min(1).optional(),
});

export const DesktopUpdateCheckOptionsSchema = z
  .object({
    silent: z.boolean().optional(),
  })
  .optional();

export type SuggestedCommand = z.infer<typeof SuggestedCommandSchema>;
export type LaunchCommand = z.infer<typeof LaunchCommandSchema>;
export type LaunchProfile = z.infer<typeof LaunchProfileSchema>;
export type DetectionResult = z.infer<typeof DetectionResultSchema>;
export type BulkImportCandidate = z.infer<typeof BulkImportCandidateSchema>;
export type ProjectRecord = z.infer<typeof ProjectRecordSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateSchema>;
export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type AppSettingsUpdate = z.infer<typeof AppSettingsUpdateSchema>;
export type DesktopEntitlements = z.infer<typeof DesktopEntitlementsSchema>;
export type SubscriptionState = z.infer<typeof SubscriptionStateSchema>;
export type BillingEvent = z.infer<typeof BillingEventSchema>;
export type LaunchResult = z.infer<typeof LaunchResultSchema>;
export type CommandRunResult = z.infer<typeof CommandRunResultSchema>;
export type RunEvent = z.infer<typeof RunEventSchema>;
export type ProjectLaunchPort = z.infer<typeof ProjectLaunchPortSchema>;
export type ProjectTerminalSession = z.infer<
  typeof ProjectTerminalSessionSchema
>;
export type ActivityItem = z.infer<typeof ActivityItemSchema>;
export type UsageStats = z.infer<typeof UsageStatsSchema>;
export type DesktopBridgeState = z.infer<typeof DesktopBridgeStateSchema>;
export type CommandSafetySummary = z.infer<typeof CommandSafetySummarySchema>;
export type RunningPort = z.infer<typeof RunningPortSchema>;
export type DiagnosticCheckResult = z.infer<typeof DiagnosticCheckResultSchema>;
export type DiagnosticsReport = z.infer<typeof DiagnosticsReportSchema>;
export type ExportRunLogsInput = z.infer<typeof ExportRunLogsInputSchema>;
export type DesktopUpdateState = z.infer<typeof DesktopUpdateStateSchema>;
export type DesktopUpdateCheckOptions = z.infer<
  typeof DesktopUpdateCheckOptionsSchema
>;

export const DEFAULT_SETTINGS: AppSettings = {
  defaultEditor: "vscode",
  terminalStrategy: "os-external",
  telemetryEnabled: false,
  askBeforeRunningNewCommands: true,
  launchOnStartup: true,
  hasCompletedOnboarding: false,
};

export const DEFAULT_SUBSCRIPTION_STATE: SubscriptionState = {
  plan: "free",
  status: "none",
  archivedProjectCount: 0,
  entitlements: {
    maxProjects: 5,
    canChangeProjectDirectories: true,
    maxConcurrentLaunches: 1,
    canBulkImport: false,
    canBulkScan: false,
    projectStorage: "firestore",
    requiresOnline: true,
    projectDetectionLevel: "basic",
    defaultDirectoryLimit: 5,
    canChangeDefaultDirectories: true,
  },
};
