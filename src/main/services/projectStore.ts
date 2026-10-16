import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

import {
  applySubscriptionProjectAccess,
  canCreateProject,
  createUpgradeRequiredError,
  isProjectLockedBySubscription,
} from "../../billing/upgradeGate";
import {
  CreateProjectInputSchema,
  DesktopEntitlementsSchema,
  LaunchCommandSchema,
  LaunchProfileSchema,
  ProjectRecordSchema,
  ProjectUpdateSchema,
  SubscriptionStateSchema,
  SuggestedCommandSchema,
  detectedTypeValues,
  type CreateProjectInput,
  type LaunchCommand,
  type LaunchProfile,
  type Project,
  type ProjectRecord,
  type ProjectUpdateInput,
  type SuggestedCommand,
} from "../types/shared";
import { FileSystemService } from "./fileSystemService";
import { DesktopApiError, SubscriptionService } from "./subscriptionService";
import { SerialTaskQueue } from "../../shared/serialTaskQueue";

const RemoteProjectDirectorySchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1).optional(),
  name: z.string().trim().min(1),
  directoryPath: z.string().trim().min(1),
  detectionLevel: z.enum(["basic", "advanced"]),
  detectionSummary: z.string().trim().nullable(),
  themeMode: z.enum(["light", "dark"]),
  themePreset: z.string().trim().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  lastLaunchedAt: z.string().min(1).nullable(),
});

const RemoteSubscriptionSnapshotSchema = z
  .object({
    plan: SubscriptionStateSchema.shape.plan,
    status: SubscriptionStateSchema.shape.status,
    expiresAt: z.string().min(1).optional(),
    entitlements: DesktopEntitlementsSchema.optional(),
  })
  .passthrough();

const RemoteProjectsListResponseSchema = z
  .object({
    projects: z.array(RemoteProjectDirectorySchema),
    archivedProjects: z.array(RemoteProjectDirectorySchema).default([]),
    subscription: RemoteSubscriptionSnapshotSchema.optional(),
    entitlements: DesktopEntitlementsSchema.optional(),
    archivedProjectCount: z.number().int().nonnegative().optional(),
  })
  .passthrough();

const RemoteProjectMutationResponseSchema = z
  .object({
    project: RemoteProjectDirectorySchema,
    subscription: RemoteSubscriptionSnapshotSchema.optional(),
    entitlements: DesktopEntitlementsSchema.optional(),
    archivedProjectCount: z.number().int().nonnegative().optional(),
  })
  .passthrough();

const RemoteBulkImportResponseSchema = z
  .object({
    projects: z.array(RemoteProjectDirectorySchema),
    subscription: RemoteSubscriptionSnapshotSchema.optional(),
    entitlements: DesktopEntitlementsSchema.optional(),
    archivedProjectCount: z.number().int().nonnegative().optional(),
  })
  .passthrough();

const LocalProjectDetailsSchema = z.object({
  id: z.string().min(1).optional(),
  path: z.string().trim().min(1),
  detectedType: z.enum(detectedTypeValues).default("unknown"),
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
  localUpdatedAt: z.string().min(1).optional(),
});

type LocalProjectDetails = z.infer<typeof LocalProjectDetailsSchema>;
type RemoteProjectDirectory = z.infer<typeof RemoteProjectDirectorySchema>;

function normalizeProjectPath(targetPath: string): string {
  const absolutePath = path.resolve(targetPath);
  return process.platform === "win32"
    ? absolutePath.toLowerCase()
    : absolutePath;
}

function filterUniqueNewProjectInputs(
  inputs: CreateProjectInput[],
  existingProjectPaths: string[],
): CreateProjectInput[] {
  const seenPaths = new Set(
    existingProjectPaths.map((entry) => normalizeProjectPath(entry)),
  );
  const uniqueInputs: CreateProjectInput[] = [];

  for (const input of inputs) {
    const normalizedPath = normalizeProjectPath(input.path);
    if (seenPaths.has(normalizedPath)) {
      continue;
    }

    seenPaths.add(normalizedPath);
    uniqueInputs.push(input);
  }

  return uniqueInputs;
}

function isSetupCommand(
  commandLike: Pick<SuggestedCommand, "label" | "command">,
): boolean {
  const commandText = commandLike.command.toLowerCase();
  const labelText = commandLike.label.toLowerCase();

  return (
    /\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|ci)\b/.test(commandText) ||
    /\b(?:pip|pip3)\s+install\b/.test(commandText) ||
    /\bpoetry\s+install\b/.test(commandText) ||
    /\buv\s+sync\b/.test(commandText) ||
    /\bcargo\s+(?:build|check|test)\b/.test(commandText) ||
    /\binstall\b/.test(labelText) ||
    /\b(?:dependencies|dependency)\b/.test(labelText) ||
    /\bsetup\b/.test(labelText)
  );
}

function isRuntimeCommand(
  commandLike: Pick<SuggestedCommand, "label" | "command">,
): boolean {
  const commandText = commandLike.command.toLowerCase();
  const labelText = commandLike.label.toLowerCase();

  if (
    /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start|serve|preview)\b/.test(
      commandText,
    ) ||
    /\bnext\s+dev\b/.test(commandText) ||
    /\bvite(?:\s|$)/.test(commandText) ||
    /\buvicorn\b/.test(commandText) ||
    /\bflask\s+run\b/.test(commandText) ||
    /\b(?:uv\s+run\s+)?python3?\s+(?:-m\s+)?[\w./\\-]+(?:\.py)?\b/.test(
      commandText,
    ) ||
    /\bcargo\s+run\b/.test(commandText) ||
    /\b(?:docker\s+compose|docker-compose)\s+up\b/.test(commandText)
  ) {
    return true;
  }

  return /\b(?:dev|development|serve|server|preview|start|run|launch|app|api|worker)\b/.test(
    labelText,
  );
}

function shouldRunOnLaunch(
  command: Pick<SuggestedCommand, "label" | "command">,
): boolean {
  return !isSetupCommand(command) && isRuntimeCommand(command);
}

function buildCommands(suggestedCommands: SuggestedCommand[]): LaunchCommand[] {
  return suggestedCommands.map((command) => ({
    id: randomUUID(),
    label: command.label,
    command: command.command,
    cwd: command.cwd,
    runOnLaunch: shouldRunOnLaunch(command),
  }));
}

function buildDefaultLaunchProfile(
  commands: LaunchCommand[],
  suggestedBrowserUrls: string[],
): LaunchProfile | undefined {
  const commandIds = commands
    .filter((command) => command.runOnLaunch)
    .map((command) => command.id);

  if (commandIds.length === 0 && suggestedBrowserUrls.length === 0) {
    return undefined;
  }

  return {
    id: randomUUID(),
    name: "Default Launch",
    openEditor: true,
    openFolder: false,
    openBrowser: suggestedBrowserUrls.length > 0,
    browserUrls: suggestedBrowserUrls,
    commandIds,
    askBeforeRun: true,
  };
}

function isDefaultLaunchProfile(profile: LaunchProfile): boolean {
  return profile.name.trim().toLowerCase() === "default launch";
}

function repairCommands(details: LocalProjectDetails): LaunchCommand[] {
  if (details.commands.length === 0) {
    return buildCommands(details.suggestedCommands);
  }

  return details.commands.map((command) => ({
    ...command,
    runOnLaunch: command.runOnLaunch,
  }));
}

function repairLaunchProfiles(
  details: LocalProjectDetails,
  commands: LaunchCommand[],
): LaunchProfile[] {
  const knownCommandIds = new Set(commands.map((command) => command.id));
  const runnableCommandIds = commands
    .filter((command) => command.runOnLaunch)
    .map((command) => command.id);
  const runnableCommandSet = new Set(runnableCommandIds);
  const suggestedBrowserUrls = [...new Set(details.suggestedBrowserUrls)];
  const fallbackProfile = buildDefaultLaunchProfile(
    commands,
    suggestedBrowserUrls,
  );

  const repairedProfiles =
    details.launchProfiles.length > 0
      ? details.launchProfiles.map((profile) => ({
          ...profile,
          commandIds: profile.commandIds.filter((commandId) =>
            knownCommandIds.has(commandId),
          ),
          browserUrls: [...new Set(profile.browserUrls)],
        }))
      : fallbackProfile
        ? [fallbackProfile]
        : [];

  if (
    runnableCommandIds.length > 0 &&
    repairedProfiles.length > 0 &&
    !repairedProfiles.some((profile) =>
      profile.commandIds.some((commandId) => runnableCommandSet.has(commandId)),
    )
  ) {
    const preferredProfileIndex = repairedProfiles.findIndex(
      isDefaultLaunchProfile,
    );
    const targetIndex = preferredProfileIndex >= 0 ? preferredProfileIndex : 0;
    const targetProfile = repairedProfiles[targetIndex];

    if (!targetProfile) {
      return repairedProfiles;
    }

    repairedProfiles[targetIndex] = {
      ...targetProfile,
      commandIds: runnableCommandIds,
      openBrowser: targetProfile.openBrowser || suggestedBrowserUrls.length > 0,
      browserUrls:
        targetProfile.browserUrls.length > 0
          ? targetProfile.browserUrls
          : suggestedBrowserUrls,
    };
  }

  return repairedProfiles;
}

function sanitizeCommandReferences(
  details: LocalProjectDetails,
): LocalProjectDetails {
  const commands = repairCommands(details);
  const launchProfiles = repairLaunchProfiles(details, commands);

  return {
    ...details,
    commands,
    suggestedBrowserUrls: [...new Set(details.suggestedBrowserUrls)],
    launchProfiles,
  };
}

function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort((left, right) => {
    const leftValue = left.lastOpenedAt ?? left.updatedAt;
    const rightValue = right.lastOpenedAt ?? right.updatedAt;
    return rightValue.localeCompare(leftValue);
  });
}

async function applyProjectAccess(
  projects: Project[],
  subscriptionService: SubscriptionService,
): Promise<Project[]> {
  const subscription = await subscriptionService.getSubscriptionState();
  return sortProjects(applySubscriptionProjectAccess(projects, subscription));
}

function summarizeDetection(input: CreateProjectInput): string {
  const primary = input.framework ?? input.detectedType;
  const details = [
    input.packageManager
      ? `Package manager: ${input.packageManager}`
      : undefined,
    input.detectedFiles.length > 0
      ? `Files: ${input.detectedFiles.slice(0, 3).join(", ")}`
      : undefined,
  ].filter(Boolean);

  return details.length > 0 ? `${primary} - ${details.join(" - ")}` : primary;
}

function buildLocalDetails(
  remoteProject: Pick<RemoteProjectDirectory, "id" | "directoryPath">,
  input: CreateProjectInput,
): LocalProjectDetails {
  const commands = input.commands ?? buildCommands(input.suggestedCommands);
  const defaultProfile = buildDefaultLaunchProfile(
    commands,
    input.suggestedBrowserUrls,
  );

  return sanitizeCommandReferences(
    LocalProjectDetailsSchema.parse({
      id: remoteProject.id,
      path: remoteProject.directoryPath,
      detectedType: input.detectedType,
      framework: input.framework,
      packageManager: input.packageManager,
      detectedFiles: [...new Set(input.detectedFiles)].sort((left, right) =>
        left.localeCompare(right),
      ),
      suggestedCommands: input.suggestedCommands,
      suggestedBrowserUrls: [...new Set(input.suggestedBrowserUrls)],
      launchProfiles:
        input.launchProfiles ?? (defaultProfile ? [defaultProfile] : []),
      commands,
      notes: input.notes ?? "",
      favorite: input.favorite ?? false,
      launchCount: 0,
      localUpdatedAt: new Date().toISOString(),
    }),
  );
}

function buildDefaultLocalDetails(
  remoteProject: Pick<RemoteProjectDirectory, "id" | "directoryPath"> & {
    updatedAt?: string;
  },
): LocalProjectDetails {
  return LocalProjectDetailsSchema.parse({
    id: remoteProject.id,
    path: remoteProject.directoryPath,
    detectedType: "unknown",
    localUpdatedAt: remoteProject.updatedAt ?? new Date().toISOString(),
  });
}

function hydrateProjectRecord(
  remoteProject: RemoteProjectDirectory,
  details: LocalProjectDetails,
): ProjectRecord {
  const updatedAt =
    [remoteProject.updatedAt, details.localUpdatedAt]
      .filter(Boolean)
      .sort()
      .at(-1) ?? remoteProject.updatedAt;

  return ProjectRecordSchema.parse({
    id: remoteProject.id,
    name: remoteProject.name,
    path: remoteProject.directoryPath,
    detectedType: details.detectedType,
    framework: details.framework,
    packageManager: details.packageManager,
    detectedFiles: details.detectedFiles,
    suggestedCommands: details.suggestedCommands,
    suggestedBrowserUrls: details.suggestedBrowserUrls,
    launchProfiles: details.launchProfiles,
    commands: details.commands,
    notes: details.notes,
    favorite: details.favorite,
    launchCount: details.launchCount,
    createdAt: remoteProject.createdAt,
    updatedAt,
    lastOpenedAt: remoteProject.lastLaunchedAt ?? undefined,
  });
}

function hydrateLocalProjectRecord(
  details: LocalProjectDetails,
): ProjectRecord {
  const updatedAt = details.localUpdatedAt ?? new Date().toISOString();
  const projectName = path.basename(details.path) || details.path;

  return ProjectRecordSchema.parse({
    id: details.id ?? `local:${normalizeProjectPath(details.path)}`,
    name: projectName,
    path: details.path,
    detectedType: details.detectedType,
    framework: details.framework,
    packageManager: details.packageManager,
    detectedFiles: details.detectedFiles,
    suggestedCommands: details.suggestedCommands,
    suggestedBrowserUrls: details.suggestedBrowserUrls,
    launchProfiles: details.launchProfiles,
    commands: details.commands,
    notes: details.notes,
    favorite: details.favorite,
    launchCount: details.launchCount,
    createdAt: updatedAt,
    updatedAt,
  });
}

function mapRemoteProjectCodeToUpgradeReason(error: DesktopApiError): Error {
  switch (error.code) {
    case "project_limit_reached":
      return createUpgradeRequiredError("projects");
    case "project_bulk_import_locked":
      return createUpgradeRequiredError("bulkImport");
    default:
      return error;
  }
}

export class ProjectStore {
  private detailsFilePath: string;
  private accountScoped = false;
  private readonly tasks = new SerialTaskQueue();
  private storeAccountId?: string;
  private readonly legacyFilePath: string;

  constructor(
    private readonly fileSystemService: FileSystemService,
    private readonly subscriptionService: SubscriptionService,
    private readonly userDataPath: string,
  ) {
    this.detailsFilePath = path.join(userDataPath, "project-details.json");
    this.legacyFilePath = path.join(userDataPath, "projects.json");
  }

  async getProjects(options?: {
    persistLocalDetails?: boolean;
    syncSubscription?: boolean;
  }): Promise<Project[]> {
    return this.withStore(() => this.getProjectsInternal(options));
  }

  private withStore<T>(operation: () => Promise<T>): Promise<T> {
    return this.tasks.run(async () => {
      const state = await this.subscriptionService.getSubscriptionState();
      this.storeAccountId = state.userId;
      this.accountScoped = Boolean(state.userId);
      this.detailsFilePath = state.userId
        ? path.join(this.userDataPath, "accounts", createHash("sha256").update(state.userId).digest("hex"), "project-details.json")
        : path.join(this.userDataPath, "project-details.json");
      const result = await operation();
      if ((await this.subscriptionService.getSubscriptionState()).userId !== state.userId) {
        throw new Error("The signed-in account changed. Retry this operation.");
      }
      return result;
    });
  }

  private async getProjectsInternal(options?: {
    persistLocalDetails?: boolean;
    syncSubscription?: boolean;
  }): Promise<Project[]> {
    const persistLocalDetails = options?.persistLocalDetails ?? true;
    const syncSubscription = options?.syncSubscription ?? true;
    const localDetails = await this.loadLocalDetails({
      repair: persistLocalDetails,
    });
    let remoteProjects: z.infer<typeof RemoteProjectsListResponseSchema>;

    try {
      remoteProjects = await this.listRemoteProjects();
    } catch (error) {
      if (error instanceof DesktopApiError) {
        return applyProjectAccess(
          await Promise.all(
            localDetails.map((details) =>
              this.hydrate(hydrateLocalProjectRecord(details)),
            ),
          ),
          this.subscriptionService,
        );
      }

      throw error;
    }

    if (syncSubscription) {
      await this.syncSubscriptionFromResponse(remoteProjects);
    }
    const allRemoteProjects = [
      ...remoteProjects.projects,
      ...remoteProjects.archivedProjects,
    ];
    let candidates = localDetails;
    if (this.accountScoped && candidates.length === 0) {
      // Adopt legacy details only for the same remote ID, never by folder alone.
      try {
        const legacy = await this.fileSystemService.readJsonFile<unknown>(path.join(this.userDataPath, "project-details.json"));
        const parsed = LocalProjectDetailsSchema.array().safeParse(legacy);
        if (parsed.success) candidates = parsed.data.filter((entry) => allRemoteProjects.some((remote) => remote.id === entry.id));
      } catch { /* A new account need not have any legacy details. */ }
    }
    const details = this.reconcileDetails(candidates, allRemoteProjects);
    const hydrated = await Promise.all(
      allRemoteProjects.map((remoteProject) =>
        this.hydrate(
          hydrateProjectRecord(
            remoteProject,
            this.findDetails(details, remoteProject),
          ),
        ),
      ),
    );

    if (persistLocalDetails) {
      await this.persistLocalDetails(details);
    }
    return applyProjectAccess(hydrated, this.subscriptionService);
  }

  async getProject(id: string): Promise<Project | null> {
    const project = (await this.getProjects()).find((entry) => entry.id === id);
    return project ?? null;
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    return this.withStore(() => this.createProjectInternal(input));
  }

  private async createProjectInternal(input: CreateProjectInput): Promise<Project> {
    const payload = CreateProjectInputSchema.parse(input);
    const subscription = await this.subscriptionService.getSubscriptionState();
    const existingProjects = await this.getProjectsInternal({
      persistLocalDetails: false,
      syncSubscription: false,
    });

    if (!canCreateProject(subscription, existingProjects.length)) {
      throw createUpgradeRequiredError("projects");
    }

    const response = await this.createRemoteProject(
      payload,
      subscription.entitlements?.projectDetectionLevel ?? "basic",
    );

    await this.syncSubscriptionFromResponse(response);

    const localDetails = await this.loadLocalDetails();
    const nextDetails = this.upsertLocalDetails(
      localDetails,
      buildLocalDetails(response.project, payload),
    );
    await this.persistLocalDetails(nextDetails);

    return this.hydrate(
      hydrateProjectRecord(
        response.project,
        this.findDetails(nextDetails, response.project),
      ),
    );
  }

  async bulkImportProjects(inputs: CreateProjectInput[]): Promise<Project[]> {
    return this.withStore(() => this.bulkImportProjectsInternal(inputs));
  }

  private async bulkImportProjectsInternal(inputs: CreateProjectInput[]): Promise<Project[]> {
    if (inputs.length === 0) {
      return [];
    }

    const parsedPayloads = inputs.map((input) =>
      CreateProjectInputSchema.parse(input),
    );
    const subscription = await this.subscriptionService.getSubscriptionState();
    const existingProjects = await this.getProjectsInternal({
      persistLocalDetails: false,
      syncSubscription: false,
    });
    const payloads = filterUniqueNewProjectInputs(
      parsedPayloads,
      existingProjects.map((project) => project.path),
    );

    if (payloads.length === 0) {
      return [];
    }

    const detectionLevel =
      subscription.entitlements?.projectDetectionLevel ?? "basic";
    const response = await this.bulkImportRemoteProjects(
      payloads,
      detectionLevel,
    );

    await this.syncSubscriptionFromResponse(response);

    const details = await this.loadLocalDetails();
    const nextDetails = payloads.reduce((current, payload, index) => {
      const remoteProject = response.projects[index];
      return remoteProject
        ? this.upsertLocalDetails(
            current,
            buildLocalDetails(remoteProject, payload),
          )
        : current;
    }, details);
    await this.persistLocalDetails(nextDetails);

    return Promise.all(
      response.projects.map((remoteProject) =>
        this.hydrate(
          hydrateProjectRecord(
            remoteProject,
            this.findDetails(nextDetails, remoteProject),
          ),
        ),
      ),
    );
  }

  async updateProject(id: string, patch: ProjectUpdateInput): Promise<Project> {
    return this.withStore(() => this.updateProjectInternal(id, patch));
  }

  private async updateProjectInternal(id: string, patch: ProjectUpdateInput): Promise<Project> {
    const payload = ProjectUpdateSchema.parse(patch);
    const details = await this.loadLocalDetails();
    const existingProject = (await this.getProjectsInternal()).find((entry) => entry.id === id);

    if (!existingProject) {
      throw new Error("Project not found.");
    }

    if (isProjectLockedBySubscription(existingProject)) {
      throw createUpgradeRequiredError("lockedProject");
    }

    const response = await this.updateRemoteProject(existingProject, payload);
    await this.syncSubscriptionFromResponse(response);

    const previousDetails = this.findDetails(details, {
      id,
      directoryPath: existingProject.path,
    });
    const nextDetails = sanitizeCommandReferences(
      LocalProjectDetailsSchema.parse({
        ...previousDetails,
        id: response.project.id,
        path: response.project.directoryPath,
        detectedType: payload.detectedType ?? previousDetails.detectedType,
        framework: payload.framework ?? previousDetails.framework,
        packageManager:
          payload.packageManager ?? previousDetails.packageManager,
        detectedFiles: payload.detectedFiles ?? previousDetails.detectedFiles,
        suggestedCommands:
          payload.suggestedCommands ?? previousDetails.suggestedCommands,
        suggestedBrowserUrls:
          payload.suggestedBrowserUrls ?? previousDetails.suggestedBrowserUrls,
        launchProfiles:
          payload.launchProfiles ?? previousDetails.launchProfiles,
        commands: payload.commands ?? previousDetails.commands,
        notes: payload.notes ?? previousDetails.notes,
        favorite: payload.favorite ?? previousDetails.favorite,
        launchCount: payload.launchCount ?? previousDetails.launchCount,
        localUpdatedAt: new Date().toISOString(),
      }),
    );

    const mergedDetails = this.upsertLocalDetails(details, nextDetails);
    await this.persistLocalDetails(mergedDetails);

    return this.hydrate(
      hydrateProjectRecord(
        response.project,
        this.findDetails(mergedDetails, response.project),
      ),
    );
  }

  async deleteProject(id: string): Promise<void> {
    return this.withStore(() => this.deleteProjectInternal(id));
  }

  private async deleteProjectInternal(id: string): Promise<void> {
    try {
      await this.subscriptionService.postAuthenticatedJson(
        "/api/desktop/projects/delete",
        {
          projectId: id,
        },
      );
    } catch (error) {
      if (error instanceof DesktopApiError) {
        throw mapRemoteProjectCodeToUpgradeReason(error);
      }
      throw error;
    }

    const details = await this.loadLocalDetails();
    const nextDetails = details.filter((entry) => entry.id !== id);
    await this.persistLocalDetails(nextDetails);
  }

  async toggleFavorite(id: string): Promise<Project> {
    return this.withStore(async () => {
    const project = (await this.getProjectsInternal()).find((entry) => entry.id === id);

    if (!project) {
      throw new Error("Project not found.");
    }

    return this.updateProjectInternal(id, { favorite: !project.favorite });
    });
  }

  private async listRemoteProjects(): Promise<
    z.infer<typeof RemoteProjectsListResponseSchema>
  > {
    try {
      const payload = await this.subscriptionService.postAuthenticatedJson(
        "/api/desktop/projects/list",
        {},
      );
      return RemoteProjectsListResponseSchema.parse(payload);
    } catch (error) {
      if (error instanceof DesktopApiError) {
        throw mapRemoteProjectCodeToUpgradeReason(error);
      }
      throw error;
    }
  }

  private async createRemoteProject(
    input: CreateProjectInput,
    detectionLevel: "basic" | "advanced",
  ): Promise<z.infer<typeof RemoteProjectMutationResponseSchema>> {
    try {
      const payload = await this.subscriptionService.postAuthenticatedJson(
        "/api/desktop/projects/create",
        {
          name: input.name,
          directoryPath: path.resolve(input.path),
          detectionLevel,
          detectionSummary: summarizeDetection(input),
        },
      );

      return RemoteProjectMutationResponseSchema.parse(payload);
    } catch (error) {
      if (error instanceof DesktopApiError) {
        throw mapRemoteProjectCodeToUpgradeReason(error);
      }
      throw error;
    }
  }

  private async bulkImportRemoteProjects(
    inputs: CreateProjectInput[],
    detectionLevel: "basic" | "advanced",
  ): Promise<z.infer<typeof RemoteBulkImportResponseSchema>> {
    try {
      const payload = await this.subscriptionService.postAuthenticatedJson(
        "/api/desktop/projects/bulk-import",
        {
          projects: inputs.map((input) => ({
            name: input.name,
            directoryPath: path.resolve(input.path),
            detectionLevel,
            detectionSummary: summarizeDetection(input),
          })),
        },
      );

      return RemoteBulkImportResponseSchema.parse(payload);
    } catch (error) {
      if (error instanceof DesktopApiError) {
        throw mapRemoteProjectCodeToUpgradeReason(error);
      }
      throw error;
    }
  }

  private async updateRemoteProject(
    existingProject: Project,
    patch: ProjectUpdateInput,
  ): Promise<z.infer<typeof RemoteProjectMutationResponseSchema>> {
    try {
      const payload = await this.subscriptionService.postAuthenticatedJson(
        "/api/desktop/projects/update",
        {
          projectId: existingProject.id,
          ...(patch.name ? { name: patch.name } : {}),
          ...(patch.path ? { directoryPath: path.resolve(patch.path) } : {}),
          ...(patch.lastOpenedAt ? { lastLaunchedAt: patch.lastOpenedAt } : {}),
        },
      );

      return RemoteProjectMutationResponseSchema.parse(payload);
    } catch (error) {
      if (error instanceof DesktopApiError) {
        throw mapRemoteProjectCodeToUpgradeReason(error);
      }
      throw error;
    }
  }

  private async syncSubscriptionFromResponse(
    response:
      | z.infer<typeof RemoteProjectsListResponseSchema>
      | z.infer<typeof RemoteProjectMutationResponseSchema>
      | z.infer<typeof RemoteBulkImportResponseSchema>,
  ): Promise<void> {
    if ((await this.subscriptionService.getSubscriptionState()).userId !== this.storeAccountId) return;
    if (!response.subscription && !response.entitlements) {
      return;
    }

    await this.subscriptionService.applyRemoteSubscriptionSnapshot({
      plan: response.subscription?.plan,
      status: response.subscription?.status,
      expiresAt: response.subscription?.expiresAt,
      archivedProjectCount: response.archivedProjectCount,
      entitlements:
        response.entitlements ?? response.subscription?.entitlements,
    });
  }

  private async loadLocalDetails(options?: {
    repair?: boolean;
  }): Promise<LocalProjectDetails[]> {
    const shouldRepair = options?.repair ?? true;

    try {
      const raw = await this.fileSystemService.readJsonFile<unknown>(
        this.detailsFilePath,
      );
      return await this.repairLocalDetails(raw, { repair: shouldRepair });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;

      if (code === "ENOENT") {
        const migrated = this.accountScoped ? [] : await this.loadLegacyDetails();
        if (shouldRepair) {
          await this.persistLocalDetails(migrated);
        }
        return migrated;
      }

      if (error instanceof SyntaxError) {
        if (shouldRepair) {
          await this.backupCorruptFile(this.detailsFilePath);
          await this.persistLocalDetails([]);
        }
        return [];
      }

      throw error;
    }
  }

  private async loadLegacyDetails(): Promise<LocalProjectDetails[]> {
    try {
      const raw = await this.fileSystemService.readJsonFile<unknown>(
        this.legacyFilePath,
      );
      const parsed = ProjectRecordSchema.array().safeParse(raw);

      if (!parsed.success) {
        return [];
      }

      return parsed.data.map((project) =>
        sanitizeCommandReferences(
          LocalProjectDetailsSchema.parse({
            id: project.id,
            path: project.path,
            detectedType: project.detectedType,
            framework: project.framework,
            packageManager: project.packageManager,
            detectedFiles: project.detectedFiles,
            suggestedCommands: project.suggestedCommands,
            suggestedBrowserUrls: project.suggestedBrowserUrls,
            launchProfiles: project.launchProfiles,
            commands: project.commands,
            notes: project.notes,
            favorite: project.favorite,
            launchCount: project.launchCount,
            localUpdatedAt: project.updatedAt,
          }),
        ),
      );
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;

      if (code === "ENOENT" || error instanceof SyntaxError) {
        return [];
      }

      throw error;
    }
  }

  private async repairLocalDetails(
    raw: unknown,
    options?: { repair?: boolean },
  ): Promise<LocalProjectDetails[]> {
    const shouldRepair = options?.repair ?? true;
    const parsed = LocalProjectDetailsSchema.array().safeParse(raw);

    if (parsed.success) {
      const repaired = parsed.data.map((details) =>
        sanitizeCommandReferences(details),
      );
      if (
        shouldRepair &&
        JSON.stringify(repaired) !== JSON.stringify(parsed.data)
      ) {
        await this.persistLocalDetails(repaired);
      }
      return repaired;
    }

    if (!Array.isArray(raw)) {
      if (shouldRepair) {
        await this.backupCorruptFile(this.detailsFilePath);
        await this.persistLocalDetails([]);
      }
      return [];
    }

    const repaired = raw.flatMap((item) => {
      const result = LocalProjectDetailsSchema.safeParse(item);
      return result.success ? [sanitizeCommandReferences(result.data)] : [];
    });

    if (shouldRepair) {
      await this.persistLocalDetails(repaired);
    }
    return repaired;
  }

  private reconcileDetails(
    details: LocalProjectDetails[],
    remoteProjects: RemoteProjectDirectory[],
  ): LocalProjectDetails[] {
    return remoteProjects.map((remoteProject) => {
      const existing = details.find(
        (entry) =>
          entry.id === remoteProject.id,
      );

      return sanitizeCommandReferences(
        LocalProjectDetailsSchema.parse({
          ...(existing ?? buildDefaultLocalDetails(remoteProject)),
          id: remoteProject.id,
          path: remoteProject.directoryPath,
        }),
      );
    });
  }

  private findDetails(
    details: LocalProjectDetails[],
    remoteProject: Pick<RemoteProjectDirectory, "id" | "directoryPath">,
  ): LocalProjectDetails {
    return (
      details.find(
        (entry) =>
          entry.id === remoteProject.id,
      ) ??
      buildDefaultLocalDetails({
        id: remoteProject.id,
        directoryPath: remoteProject.directoryPath,
        updatedAt: new Date().toISOString(),
      })
    );
  }

  private upsertLocalDetails(
    details: LocalProjectDetails[],
    nextDetails: LocalProjectDetails,
  ): LocalProjectDetails[] {
    const normalizedPath = normalizeProjectPath(nextDetails.path);
    const filtered = details.filter(
      (entry) =>
        entry.id !== nextDetails.id &&
        normalizeProjectPath(entry.path) !== normalizedPath,
    );

    return [nextDetails, ...filtered];
  }

  private async persistLocalDetails(
    details: LocalProjectDetails[],
  ): Promise<void> {
    await this.fileSystemService.writeJsonAtomic(this.detailsFilePath, details);
  }

  private async backupCorruptFile(targetPath: string): Promise<void> {
    if (!(await this.fileSystemService.exists(targetPath))) {
      return;
    }

    const backupPath = `${targetPath}.${Date.now()}.corrupt`;
    await this.fileSystemService.moveFile(targetPath, backupPath);
  }

  private async hydrate(record: ProjectRecord): Promise<Project> {
    const missingFolder = !(await this.fileSystemService.exists(record.path));
    return {
      ...record,
      missingFolder,
    };
  }
}
