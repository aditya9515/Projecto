import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { shell } from "electron";
import { z } from "zod";

import {
  createUpgradeRequiredError,
  getMaxConcurrentLaunches,
  isProjectLockedBySubscription,
} from "../../billing/upgradeGate";
import {
  type CommandSafetySummary,
  LaunchResultSchema,
  type CommandRunResult,
  type LaunchCommand,
  type LaunchResult,
  type ProjectLaunchPort,
  type ProjectLaunchPortSource,
  type ProjectTerminalSession,
  type Project,
  type RunEvent,
  RunEventSchema,
} from "../types/shared";
import { getRunnableProfileCommands } from "../../shared/launchResolution";
import {
  createProjectAlreadyRunningError,
  createProjectPortOwnedError,
} from "../../shared/launchErrors";
import { CommandRunner } from "./commandRunner";
import {
  CommandSafetyService,
  type CommandApprovalOptions,
} from "./commandSafetyService";
import { DesktopBridgeService } from "./desktopBridgeService";
import { EditorService } from "./editorService";
import { ProjectStore } from "./projectStore";
import { SettingsStore } from "./settingsStore";
import { ActivityStore } from "./activityStore";
import { ExternalUrlService } from "./externalUrlService";
import { SubscriptionService } from "./subscriptionService";
import { TerminalSessionStore } from "./terminalSessionStore";
import {
  detectLaunchOutputSignals,
  extractPortFromUrl,
  isLikelyAppUrl,
  normalizeDiscoveredUrl,
} from "./launchOutputParser";

const urlSchema = z.string().url();
const BROWSER_URL_DETECTION_TIMEOUT_MS = 15_000;
const DETECTED_URL_SETTLE_MS = 500;
const EDITOR_WORKSPACE_REGISTRATION_TIMEOUT_MS = 12_000;
const EDITOR_WORKSPACE_REGISTRATION_POLL_MS = 250;

type ActiveRunMetadata = {
  projectId: string;
  commandId?: string;
  executionMode?: RunEvent["executionMode"];
  managed: boolean;
};

type LaunchReadiness = {
  projectId: string;
  launchId: string;
  terminalStrategy: RunEvent["executionMode"];
  expectsBrowser: boolean;
  readyEmitted: boolean;
  detectedUrls: string[];
  detectedPorts: ProjectLaunchPort[];
};

function isFinalRunStatus(status: RunEvent["status"]): boolean {
  return status === "completed" || status === "failed" || status === "stopped";
}

function getManagedState(event: RunEvent): boolean {
  return event.managed ?? event.executionMode !== "os-external";
}

function buildExternalTerminalTitle(
  projectName: string,
  runId: string,
): string {
  return `Projecto: ${projectName} (${runId.slice(0, 8)})`;
}

function isOsTerminalStrategy(
  terminalStrategy: RunEvent["executionMode"],
): boolean {
  return (
    terminalStrategy === "os-internal" || terminalStrategy === "os-external"
  );
}

function isVisibleOsTerminalStrategy(
  terminalStrategy: RunEvent["executionMode"],
): boolean {
  return terminalStrategy === "os-external";
}

function isVscodeTerminalStrategy(
  terminalStrategy: RunEvent["executionMode"],
): boolean {
  return (
    terminalStrategy === "vscode-internal" ||
    terminalStrategy === "vscode-external"
  );
}

function getVscodeTerminalLocation(
  terminalStrategy: RunEvent["executionMode"],
): "panel" | "editor" {
  return terminalStrategy === "vscode-external" ? "editor" : "panel";
}

async function canReachUrl(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_000);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForReachableUrl(
  url: string,
  timeoutMs: number,
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await canReachUrl(url)) {
      return true;
    }

    await sleep(750);
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type BrowserCandidate = {
  url: string;
  runId?: string;
};

function isActiveTerminalSession(session: ProjectTerminalSession): boolean {
  return (
    session.status === "running" ||
    session.status === "ready" ||
    session.status === "stopping"
  );
}

function mergeDetectedPorts(
  current: ProjectLaunchPort[],
  next: ProjectLaunchPort[],
): ProjectLaunchPort[] {
  const byKey = new Map<string, ProjectLaunchPort>();

  for (const port of [...current, ...next]) {
    byKey.set(
      [
        port.projectId,
        port.runId ?? "",
        port.host.toLowerCase(),
        port.port,
        port.url ?? "",
        port.source,
      ].join(":"),
      port,
    );
  }

  return [...byKey.values()];
}

function isOwnedLaunchPort(port: ProjectLaunchPort): boolean {
  return port.source !== "configured";
}

export class LauncherService {
  private readonly events = new EventEmitter();
  private readonly terminalSessionEvents = new EventEmitter();
  private readonly activeRunsByProject = new Map<string, Set<string>>();
  private readonly activeCommandCountsByProject = new Map<
    string,
    Map<string, number>
  >();
  private readonly activeRunMetadata = new Map<string, ActiveRunMetadata>();
  private readonly runIdsByLaunch = new Map<string, Set<string>>();
  private readonly launchReadiness = new Map<string, LaunchReadiness>();
  private readonly projectPortRegistry = new Map<string, ProjectLaunchPort>();
  private readonly stoppingProjectIds = new Set<string>();
  private readonly openedBrowserUrls = new Set<string>();
  private readonly reportedDetectedUrls = new Set<string>();
  private readonly reportedPortFallbacks = new Set<string>();
  private readonly reportedNextLockErrors = new Set<string>();

  constructor(
    private readonly projectStore: ProjectStore,
    private readonly settingsStore: SettingsStore,
    private readonly editorService: EditorService,
    private readonly commandRunner: CommandRunner,
    private readonly activityStore: ActivityStore,
    private readonly externalUrlService: ExternalUrlService,
    private readonly subscriptionService: SubscriptionService,
    private readonly commandSafetyService: CommandSafetyService,
    private readonly desktopBridgeService: DesktopBridgeService,
    private readonly terminalSessionStore: TerminalSessionStore,
  ) {
    this.commandRunner.onRunEvent((event) => {
      this.handleRunEvent(RunEventSchema.parse(event));
    });
    this.desktopBridgeService.onRunEvent((event) => {
      this.handleRunEvent(RunEventSchema.parse(event));
    });
  }

  onRunEvent(listener: (event: RunEvent) => void): () => void {
    const wrapped = (event: unknown) => listener(RunEventSchema.parse(event));
    this.events.on("run-event", wrapped);

    return () => {
      this.events.off("run-event", wrapped);
    };
  }

  onTerminalSession(
    listener: (session: ProjectTerminalSession | null) => void,
  ): () => void {
    this.terminalSessionEvents.on("terminal-session", listener);

    return () => {
      this.terminalSessionEvents.off("terminal-session", listener);
    };
  }

  async getTerminalSessions(): Promise<ProjectTerminalSession[]> {
    return this.terminalSessionStore.getSessions();
  }

  async revealProjectTerminal(
    projectId: string,
  ): Promise<ProjectTerminalSession | null> {
    const sessions = await this.terminalSessionStore.getSessions();
    const session = sessions.find((entry) => entry.projectId === projectId);

    if (!session) {
      throw new Error("No mapped terminal session was found for this project.");
    }

    if (isVscodeTerminalStrategy(session.terminalStrategy)) {
      await this.desktopBridgeService.revealProjectTerminal({
        projectId: session.projectId,
        projectPath: session.projectPath,
        runId: session.activeRunId,
      });
      await this.updateTerminalSession(projectId, {
        status: "stopping",
        lastMessage:
          "VS Code terminal revealed. Stop requested through Projecto.",
      });
      this.stoppingProjectIds.add(projectId);
      return session;
    }

    if (!isVisibleOsTerminalStrategy(session.terminalStrategy)) {
      throw new Error(
        "This project is running as an internal background process. Use Stop to end it; there is no terminal window to reveal.",
      );
    }

    const revealed = session.activeRunId
      ? await this.commandRunner.revealExternalRun(
          session.activeRunId,
          session.terminalTitle,
        )
      : false;

    if (!revealed) {
      await this.clearTerminalSession(projectId);
      this.stoppingProjectIds.delete(projectId);
      throw new Error(
        "The mapped OS terminal could not be found. Projecto cleared the stale session; launch the project again to start a fresh terminal.",
      );
    }

    await this.updateTerminalSession(projectId, {
      status: "stopping",
      lastMessage:
        "OS terminal window revealed. Stop the project from Projecto when possible.",
    });
    this.stoppingProjectIds.add(projectId);

    return session;
  }

  async openFolder(targetPath: string): Promise<void> {
    const result = await shell.openPath(targetPath);

    if (result) {
      throw new Error(result);
    }
  }

  async openEditor(projectId: string): Promise<void> {
    const project = await this.projectStore.getProject(projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    if (project.missingFolder) {
      throw new Error("Project folder is missing.");
    }

    const settings = await this.settingsStore.getSettings();
    await this.editorService.openProjectEditor(project, settings);
  }

  async openUrl(url: string): Promise<void> {
    const validatedUrl = urlSchema.parse(url);
    await this.externalUrlService.openUrl(validatedUrl);
  }

  async runCommand(
    projectId: string,
    commandId: string,
    options?: CommandApprovalOptions,
  ): Promise<CommandRunResult> {
    const project = await this.projectStore.getProject(projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    this.assertProjectLaunchAccess(project);
    await this.assertNoActiveProjectSession(projectId);
    await this.assertConcurrentLaunchAccess(projectId);

    if (project.missingFolder) {
      throw new Error("Project folder is missing.");
    }

    const command = project.commands.find((entry) => entry.id === commandId);

    if (!command) {
      throw new Error("Command not found.");
    }

    this.assertCommandsNotAlreadyRunning(project, [command]);
    await this.commandSafetyService.ensureCommandsAllowed(
      [{ project, command }],
      options,
    );

    const settings = await this.settingsStore.getSettings();
    if (isVscodeTerminalStrategy(settings.terminalStrategy)) {
      await this.editorService.openProjectEditor(project, settings);
    }

    const result = await this.runCommandWithStrategy(
      project,
      command,
      settings,
      {
        editorAlreadyOpen: isVscodeTerminalStrategy(settings.terminalStrategy),
      },
    );
    await this.createTerminalSession(project, settings.terminalStrategy, {
      runIds: [result.runId],
      activeRunId: result.runId,
      status: "running",
      terminalTitle:
        isVisibleOsTerminalStrategy(settings.terminalStrategy)
          ? buildExternalTerminalTitle(project.name, result.runId)
          : undefined,
      lastMessage: `Running ${command.label}`,
    });

    await this.projectStore.updateProject(projectId, {
      launchCount: project.launchCount + 1,
      lastOpenedAt: new Date().toISOString(),
    });
    await this.activityStore.recordActivity({
      kind: "run-command",
      title: `Ran ${command.label}`,
      description: project.name,
      projectId: project.id,
    });

    return result;
  }

  async launchProfile(
    projectId: string,
    profileId: string,
    options?: CommandApprovalOptions,
  ): Promise<LaunchResult> {
    const project = await this.projectStore.getProject(projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    this.assertProjectLaunchAccess(project);

    if (project.missingFolder) {
      throw new Error("Project folder is missing.");
    }

    const profile = project.launchProfiles.find(
      (entry) => entry.id === profileId,
    );

    if (!profile) {
      throw new Error("Launch profile not found.");
    }

    const selectedCommands = getRunnableProfileCommands(project, profile);
    await this.assertNoActiveProjectSession(projectId);
    await this.assertConcurrentLaunchAccess(projectId);
    await this.assertNoProjectOwnedPortConflict(
      projectId,
      profile.openBrowser ? profile.browserUrls : [],
    );
    this.assertCommandsNotAlreadyRunning(project, selectedCommands);
    await this.commandSafetyService.ensureCommandsAllowed(
      selectedCommands.map((command) => ({ project, command })),
      options,
    );

    const settings = await this.settingsStore.getSettings();
    const launchId = randomUUID();
    const shouldOpenEditor =
      profile.openEditor ||
      (isVscodeTerminalStrategy(settings.terminalStrategy) &&
        selectedCommands.length > 0);
    const expectsBrowser =
      profile.openBrowser &&
      (profile.browserUrls.length > 0 || selectedCommands.length > 0);

    this.launchReadiness.set(launchId, {
      projectId: project.id,
      launchId,
      terminalStrategy: settings.terminalStrategy,
      expectsBrowser,
      readyEmitted: false,
      detectedUrls: [],
      detectedPorts: this.buildLaunchPortsFromUrls(
        project.id,
        profile.openBrowser ? profile.browserUrls : [],
        "configured",
      ),
    });

    if (shouldOpenEditor) {
      await this.editorService.openProjectEditor(
        project,
        settings,
        isVscodeTerminalStrategy(settings.terminalStrategy)
          ? undefined
          : { reuseWindow: false },
      );
    }

    if (profile.openFolder) {
      await this.openFolder(project.path);
    }

    if (profile.openBrowser) {
      this.scheduleBrowserOpen(
        project.id,
        launchId,
        selectedCommands.length,
        settings.terminalStrategy,
        profile.browserUrls,
      );
    }

    const startedResults: CommandRunResult[] = [];

    try {
      for (const command of selectedCommands) {
        const result = await this.runCommandWithStrategy(
          project,
          command,
          settings,
          {
            launchId,
            profileId: profile.id,
            editorAlreadyOpen: shouldOpenEditor,
          },
        );
        startedResults.push(result);
      }
    } catch (error) {
      for (const result of startedResults) {
        if (!this.stopRun(result.runId)) {
          this.emitRunEvent({
            runId: result.runId,
            projectId: project.id,
            launchId,
            profileId: profile.id,
            commandId: result.commandId,
            kind: "system",
            message:
              "Launch failed after this background process started. Projecto could not confirm that it stopped.",
            timestamp: new Date().toISOString(),
            executionMode: settings.terminalStrategy,
            managed: result.managed,
          });
        }
      }
      this.launchReadiness.delete(launchId);
      await this.clearTerminalSession(project.id);
      this.emitRunEvent({
        runId: launchId,
        projectId: project.id,
        launchId,
        profileId: profile.id,
        kind: "status",
        status: "failed",
        message:
          error instanceof Error
            ? error.message
            : "Project launch failed after some commands started.",
        timestamp: new Date().toISOString(),
        executionMode: settings.terminalStrategy,
      });
      throw error;
    }

    const readiness = this.launchReadiness.get(launchId);
    const results = startedResults;
    await this.createTerminalSession(project, settings.terminalStrategy, {
      launchId,
      profileId: profile.id,
      runIds: results.map((result) => result.runId),
      activeRunId: results[0]?.runId,
      detectedUrls: readiness?.detectedUrls,
      detectedPorts: readiness?.detectedPorts,
      status:
        readiness?.readyEmitted || selectedCommands.length === 0
          ? "ready"
          : "running",
      terminalTitle:
        isVisibleOsTerminalStrategy(settings.terminalStrategy) && results[0]
          ? buildExternalTerminalTitle(project.name, results[0].runId)
          : undefined,
      lastMessage:
        readiness?.readyEmitted || selectedCommands.length === 0
          ? `${profile.name} is ready.`
          : `Launching ${profile.name}`,
    });

    if (selectedCommands.length === 0) {
      this.markLaunchReady(
        project.id,
        launchId,
        launchId,
        `${profile.name} is ready.`,
      );
    }

    await this.projectStore.updateProject(projectId, {
      launchCount: project.launchCount + 1,
      lastOpenedAt: new Date().toISOString(),
    });
    await this.activityStore.recordActivity({
      kind: "launch-profile",
      title: `Launched ${profile.name}`,
      description: project.name,
      projectId: project.id,
    });

    return LaunchResultSchema.parse({
      launchId,
      profileId: profile.id,
      commandRunIds: results.map((result) => result.runId),
      status: results.length > 0 ? "started" : "completed",
    });
  }

  stopRun(runId: string): boolean {
    const metadata = this.activeRunMetadata.get(runId);

    if (isVscodeTerminalStrategy(metadata?.executionMode)) {
      return this.desktopBridgeService.stopEditorTerminalRun(runId);
    }

    if (isOsTerminalStrategy(metadata?.executionMode)) {
      return this.commandRunner.stopRun(runId);
    }

    if (metadata?.managed === false) {
      return false;
    }

    return this.commandRunner.stopRun(runId);
  }

  async stopProjectTerminal(projectId: string): Promise<boolean> {
    const sessions = await this.terminalSessionStore.getSessions();
    const session = sessions.find(
      (entry) =>
        entry.projectId === projectId && isActiveTerminalSession(entry),
    );

    if (!session) {
      throw new Error("No active project session was found to stop.");
    }

    await this.updateTerminalSession(projectId, {
      status: "stopping",
      lastMessage: "Stopping project from Projecto.",
    });
    this.stoppingProjectIds.add(projectId);

    const runIds = new Set(session.runIds);

    if (session.activeRunId) {
      runIds.add(session.activeRunId);
    }

    let stopped = false;

    for (const runId of runIds) {
      if (this.stopRun(runId)) {
        stopped = true;
      }
    }

    if (!stopped && isOsTerminalStrategy(session.terminalStrategy)) {
      await this.clearTerminalSession(projectId);
      throw new Error(
        "Projecto could not find a managed background process for this session, so it cleared the stale launch state.",
      );
    }

    return stopped;
  }

  stopAllRuns(): void {
    this.commandRunner.stopAll();
  }

  async getCommandSafety(projectId: string): Promise<CommandSafetySummary[]> {
    const project = await this.projectStore.getProject(projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    return this.commandSafetyService.getCommandSafety(project);
  }

  private trackActiveRun(event: RunEvent): void {
    const { projectId, runId, commandId } = event;
    const managed = getManagedState(event);

    if (this.activeRunMetadata.has(runId)) {
      return;
    }

    const activeRuns =
      this.activeRunsByProject.get(projectId) ?? new Set<string>();
    activeRuns.add(runId);
    this.activeRunsByProject.set(projectId, activeRuns);
    this.activeRunMetadata.set(runId, {
      projectId,
      commandId,
      executionMode: event.executionMode,
      managed,
    });

    if (event.launchId) {
      const launchRuns =
        this.runIdsByLaunch.get(event.launchId) ?? new Set<string>();
      launchRuns.add(runId);
      this.runIdsByLaunch.set(event.launchId, launchRuns);
    }

    if (!commandId) {
      return;
    }

    const activeCommands =
      this.activeCommandCountsByProject.get(projectId) ??
      new Map<string, number>();
    activeCommands.set(commandId, (activeCommands.get(commandId) ?? 0) + 1);
    this.activeCommandCountsByProject.set(projectId, activeCommands);
  }

  private releaseActiveRun(runId: string): void {
    const metadata = this.activeRunMetadata.get(runId);

    if (!metadata) {
      return;
    }

    const { projectId, commandId } = metadata;
    const activeRuns = this.activeRunsByProject.get(projectId);

    if (!activeRuns) {
      this.activeRunMetadata.delete(runId);
      return;
    }

    activeRuns.delete(runId);

    if (activeRuns.size === 0) {
      this.activeRunsByProject.delete(projectId);
    }

    if (commandId) {
      const activeCommands = this.activeCommandCountsByProject.get(projectId);

      if (activeCommands) {
        const nextCount = (activeCommands.get(commandId) ?? 0) - 1;

        if (nextCount > 0) {
          activeCommands.set(commandId, nextCount);
        } else {
          activeCommands.delete(commandId);
        }

        if (activeCommands.size === 0) {
          this.activeCommandCountsByProject.delete(projectId);
        }
      }
    }

    this.activeRunMetadata.delete(runId);
  }

  private async assertConcurrentLaunchAccess(projectId: string): Promise<void> {
    const subscription = await this.subscriptionService.getSubscriptionState();
    const maxConcurrentLaunches = getMaxConcurrentLaunches(subscription);

    if (maxConcurrentLaunches === null) {
      return;
    }

    const sessions = await this.terminalSessionStore.getSessions();
    const activeProjectIds = new Set(
      sessions
        .filter(isActiveTerminalSession)
        .map((session) => session.projectId),
    );

    for (const [activeProjectId, runs] of this.activeRunsByProject.entries()) {
      if (runs.size > 0) {
        activeProjectIds.add(activeProjectId);
      }
    }

    const alreadyActive = activeProjectIds.has(projectId);

    if (!alreadyActive && activeProjectIds.size >= maxConcurrentLaunches) {
      throw createUpgradeRequiredError("concurrentLaunches");
    }
  }

  private assertProjectLaunchAccess(project: Project): void {
    if (isProjectLockedBySubscription(project)) {
      throw createUpgradeRequiredError("lockedProject");
    }
  }

  private async assertNoActiveProjectSession(projectId: string): Promise<void> {
    const activeRuns = this.activeRunsByProject.get(projectId);

    if (activeRuns && activeRuns.size > 0) {
      throw createProjectAlreadyRunningError(projectId);
    }

    const sessions = await this.terminalSessionStore.getSessions();
    const activeSession = sessions.find(
      (session) =>
        session.projectId === projectId && isActiveTerminalSession(session),
    );

    if (activeSession) {
      throw createProjectAlreadyRunningError(projectId);
    }
  }

  private async assertNoProjectOwnedPortConflict(
    projectId: string,
    urls: string[],
  ): Promise<void> {
    const requestedPorts = this.buildLaunchPortsFromUrls(
      projectId,
      urls,
      "configured",
    );

    if (requestedPorts.length === 0) {
      return;
    }

    const sessions = await this.terminalSessionStore.getSessions();
    this.refreshProjectPortRegistry(sessions);

    for (const requestedPort of requestedPorts) {
      const owner = this.projectPortRegistry.get(
        this.getProjectPortRegistryKey(requestedPort),
      );

      if (!owner) {
        continue;
      }

      if (owner.projectId === projectId) {
        throw createProjectAlreadyRunningError(projectId);
      }

      throw createProjectPortOwnedError(owner.port, owner.projectId);
    }
  }

  private refreshProjectPortRegistry(
    sessions: ProjectTerminalSession[],
  ): void {
    this.projectPortRegistry.clear();

    for (const session of sessions) {
      if (!isActiveTerminalSession(session)) {
        continue;
      }

      for (const port of session.detectedPorts ?? []) {
        if (!isOwnedLaunchPort(port)) {
          continue;
        }

        this.projectPortRegistry.set(
          this.getProjectPortRegistryKey(port),
          port,
        );
      }
    }
  }

  private getProjectPortRegistryKey(
    port: Pick<ProjectLaunchPort, "host" | "port">,
  ): string {
    return `${port.host.toLowerCase()}:${port.port}`;
  }

  private buildLaunchPort(input: {
    projectId: string;
    source: ProjectLaunchPortSource;
    host: string;
    port: number;
    url?: string;
    runId?: string;
    detectedAt?: string;
  }): ProjectLaunchPort {
    return {
      projectId: input.projectId,
      runId: input.runId,
      host: input.host.toLowerCase(),
      port: input.port,
      url: input.url,
      source: input.source,
      detectedAt: input.detectedAt ?? new Date().toISOString(),
    };
  }

  private buildLaunchPortsFromUrls(
    projectId: string,
    urls: string[],
    source: ProjectLaunchPortSource,
    runId?: string,
  ): ProjectLaunchPort[] {
    return urls.flatMap((url) => {
      const normalizedUrl = normalizeDiscoveredUrl(url) ?? url;

      if (!isLikelyAppUrl(normalizedUrl)) {
        return [];
      }

      const detectedPort = extractPortFromUrl(normalizedUrl);

      if (!detectedPort) {
        return [];
      }

      return [
        this.buildLaunchPort({
          projectId,
          runId,
          source,
          host: detectedPort.host,
          port: detectedPort.port,
          url: normalizedUrl,
        }),
      ];
    });
  }

  private recordLaunchReadinessData(
    launchId: string | undefined,
    input: {
      urls?: string[];
      ports?: ProjectLaunchPort[];
    },
  ): void {
    if (!launchId) {
      return;
    }

    const readiness = this.launchReadiness.get(launchId);

    if (!readiness) {
      return;
    }

    const urls = [...new Set([...readiness.detectedUrls, ...(input.urls ?? [])])];
    const ports = mergeDetectedPorts(
      readiness.detectedPorts,
      input.ports ?? [],
    );

    this.launchReadiness.set(launchId, {
      ...readiness,
      detectedUrls: urls,
      detectedPorts: ports,
    });
  }

  private assertCommandsNotAlreadyRunning(
    project: { id: string; name: string },
    commands: LaunchCommand[],
  ): void {
    if (commands.length === 0) {
      return;
    }

    const activeCommands = this.activeCommandCountsByProject.get(project.id);

    if (!activeCommands || activeCommands.size === 0) {
      return;
    }

    const duplicates = commands.filter(
      (command) => (activeCommands.get(command.id) ?? 0) > 0,
    );

    if (duplicates.length === 0) {
      return;
    }

    const labels = duplicates.map((command) => command.label).join(", ");
    throw new Error(
      `${labels} is already running for ${project.name}. Stop the current process from Run Logs before launching it again.`,
    );
  }

  private emitRunEvent(event: RunEvent): void {
    this.handleRunEvent(RunEventSchema.parse(event));
  }

  private scheduleBrowserOpen(
    projectId: string,
    launchId: string,
    commandCount: number,
    terminalStrategy: Awaited<
      ReturnType<SettingsStore["getSettings"]>
    >["terminalStrategy"],
    configuredUrls: string[],
  ): void {
    if (configuredUrls.length === 0 && commandCount === 0) {
      return;
    }

    if (commandCount === 0) {
      void this.openBrowserCandidatesWhenReady(
        projectId,
        launchId,
        configuredUrls.map((url) => ({ url })),
      ).catch(() => undefined);
      return;
    }

    void this.openBrowserWhenReady(projectId, launchId, configuredUrls);
  }

  private async openBrowserCandidatesWhenReady(
    projectId: string,
    launchId: string,
    candidates: BrowserCandidate[],
  ): Promise<void> {
    const normalizedCandidates = candidates
      .map((candidate) => ({
        ...candidate,
        url: normalizeDiscoveredUrl(candidate.url) ?? candidate.url,
      }))
      .filter(
        (candidate, index, all) =>
          all.findIndex((entry) => entry.url === candidate.url) === index,
      );
    const pollableUrls = normalizedCandidates.filter((candidate) =>
      isLikelyAppUrl(candidate.url),
    );
    const passthroughUrls = normalizedCandidates.filter(
      (candidate) => !isLikelyAppUrl(candidate.url),
    );
    const reachableUrls = await Promise.all(
      pollableUrls.map(async (candidate) => ({
        ...candidate,
        reachable: await waitForReachableUrl(
          candidate.url,
          BROWSER_URL_DETECTION_TIMEOUT_MS,
        ),
      })),
    );
    const reachableCandidates = [
      ...reachableUrls.filter((entry) => entry.reachable),
      ...passthroughUrls,
    ];
    const bestCandidate = reachableCandidates[0];

    if (bestCandidate) {
      this.recordLaunchReadinessData(launchId, {
        urls: [bestCandidate.url],
        ports: this.buildLaunchPortsFromUrls(
          projectId,
          [bestCandidate.url],
          "generic",
          bestCandidate.runId,
        ),
      });
      await this.openUrlOnce(
        bestCandidate.runId ?? launchId,
        bestCandidate.url,
      );
      this.markLaunchReady(
        projectId,
        launchId,
        bestCandidate.runId ?? launchId,
        `Ready at ${bestCandidate.url}`,
        bestCandidate.url,
      );
      this.emitRunEvent({
        runId: bestCandidate.runId ?? randomUUID(),
        projectId,
        launchId,
        kind: "system",
        message: `Opened ${bestCandidate.url} in your browser.`,
        timestamp: new Date().toISOString(),
      });
    }

    if (reachableUrls.some((entry) => !entry.reachable)) {
      this.emitRunEvent({
        runId:
          reachableUrls.find((entry) => !entry.reachable)?.runId ??
          randomUUID(),
        projectId,
        launchId,
        kind: "system",
        message:
          "Server may still be starting. Open browser manually if needed.",
        timestamp: new Date().toISOString(),
      });
    }

    if (!bestCandidate && normalizedCandidates.length === 0) {
      this.emitRunEvent({
        runId: randomUUID(),
        projectId,
        launchId,
        kind: "system",
        message:
          "No app URL was detected from the terminal yet. The project may still be starting; check Run Logs or open the URL manually.",
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async openBrowserWhenReady(
    projectId: string,
    launchId: string,
    configuredUrls: string[],
  ): Promise<void> {
    const candidates = await new Promise<BrowserCandidate[]>((resolve) => {
      const discovered = new Map<string, BrowserCandidate>();
      let settleTimer: NodeJS.Timeout | undefined;

      const finish = (nextCandidates: BrowserCandidate[]) => {
        if (settleTimer) {
          clearTimeout(settleTimer);
        }
        clearTimeout(timeout);
        this.events.off("run-event", listener);
        const configured = configuredUrls.map((url) => ({ url }));

        if (nextCandidates.length > 0) {
          resolve(nextCandidates);
          return;
        }

        resolve(configured);
      };

      const listener = (event: unknown) => {
        const parsed = RunEventSchema.safeParse(event);

        if (!parsed.success) {
          return;
        }

        const nextEvent = parsed.data;

        if (nextEvent.launchId !== launchId) {
          return;
        }

        if (nextEvent.kind === "url-detected" && nextEvent.url) {
          discovered.set(nextEvent.url, {
            url: nextEvent.url,
            runId: nextEvent.runId,
          });
          if (settleTimer) {
            clearTimeout(settleTimer);
          }
          settleTimer = setTimeout(() => {
            finish([...discovered.values()]);
          }, DETECTED_URL_SETTLE_MS);
        }
      };

      const timeout = setTimeout(() => {
        finish([...discovered.values()]);
      }, BROWSER_URL_DETECTION_TIMEOUT_MS);

      this.events.on("run-event", listener);
    });

    await this.openBrowserCandidatesWhenReady(projectId, launchId, candidates);
  }

  private async openUrlOnce(scopeId: string, url: string): Promise<void> {
    const key = `${scopeId}:${url}`;

    if (this.openedBrowserUrls.has(key)) {
      return;
    }

    this.openedBrowserUrls.add(key);
    await this.openUrl(url);
  }

  private async runCommandWithStrategy(
    project: Project,
    command: LaunchCommand,
    settings: Awaited<ReturnType<SettingsStore["getSettings"]>>,
    options?: {
      launchId?: string;
      profileId?: string;
      editorAlreadyOpen?: boolean;
    },
  ): Promise<CommandRunResult> {
    if (isOsTerminalStrategy(settings.terminalStrategy)) {
      return this.commandRunner.runCommand({
        projectId: project.id,
        projectName: project.name,
        projectPath: project.path,
        command,
        terminalStrategy: settings.terminalStrategy,
        launchId: options?.launchId,
        profileId: options?.profileId,
      });
    }

    if (!(await this.waitForEditorWorkspaceConnection(project.path))) {
      throw new Error(
        "VS Code terminal mode requires the Projecto VS Code extension. Projecto opened VS Code, but the extension did not register this workspace before the timeout. Reopen VS Code or choose an OS Terminal mode.",
      );
    }

    return this.desktopBridgeService.runCommandInEditorTerminal(
      project,
      command,
      {
        launchId: options?.launchId,
        profileId: options?.profileId,
        terminalLocation: getVscodeTerminalLocation(settings.terminalStrategy),
      },
    );
  }

  private async waitForEditorWorkspaceConnection(
    projectPath: string,
  ): Promise<boolean> {
    const startedAt = Date.now();

    while (
      Date.now() - startedAt < EDITOR_WORKSPACE_REGISTRATION_TIMEOUT_MS
    ) {
      if (this.desktopBridgeService.hasConnectedEditorForPath(projectPath)) {
        return true;
      }

      await sleep(EDITOR_WORKSPACE_REGISTRATION_POLL_MS);
    }

    return this.desktopBridgeService.hasConnectedEditorForPath(projectPath);
  }

  private handleRunEvent(inputEvent: RunEvent): void {
    const event = RunEventSchema.parse(
      inputEvent.kind === "status" &&
        inputEvent.status === "failed" &&
        this.stoppingProjectIds.has(inputEvent.projectId)
        ? {
            ...inputEvent,
            status: "stopped",
            message: "Project stopped from the mapped terminal.",
          }
        : inputEvent,
    );
    this.events.emit("run-event", event);
    this.processLaunchOutputSignals(event);
    void this.updateTerminalSessionFromRunEvent(event);

    if (event.kind !== "status") {
      return;
    }

    if (
      event.status === "started" ||
      event.status === "running" ||
      event.status === "spawned" ||
      event.status === "ready"
    ) {
      this.trackActiveRun(event);
    }

    if (
      (event.status === "running" || event.status === "spawned") &&
      event.launchId
    ) {
      const readiness = this.launchReadiness.get(event.launchId);

      if (readiness && !readiness.expectsBrowser) {
        this.markLaunchReady(
          event.projectId,
          event.launchId,
          event.runId,
          "Project terminal is ready.",
        );
      }
    }

    if (isFinalRunStatus(event.status)) {
      this.releaseActiveRun(event.runId);
      this.stoppingProjectIds.delete(event.projectId);
      this.cleanupRunTracking(event.runId, event.launchId);

      if (event.launchId) {
        const launchRuns = this.runIdsByLaunch.get(event.launchId);

        if (
          launchRuns &&
          [...launchRuns].every((runId) => !this.activeRunMetadata.has(runId))
        ) {
          this.runIdsByLaunch.delete(event.launchId);
          this.launchReadiness.delete(event.launchId);
        }
      }
    }
  }

  private cleanupRunTracking(runId: string, launchId?: string): void {
    for (const key of [...this.reportedDetectedUrls]) {
      if (key.startsWith(`${runId}:`)) {
        this.reportedDetectedUrls.delete(key);
      }
    }

    for (const key of [...this.reportedPortFallbacks]) {
      if (key.startsWith(`${runId}:`)) {
        this.reportedPortFallbacks.delete(key);
      }
    }

    this.reportedNextLockErrors.delete(runId);

    for (const key of [...this.openedBrowserUrls]) {
      if (
        key.startsWith(`${runId}:`) ||
        (launchId && key.startsWith(`${launchId}:`))
      ) {
        this.openedBrowserUrls.delete(key);
      }
    }
  }

  private processLaunchOutputSignals(event: RunEvent): void {
    if (event.kind !== "stdout" && event.kind !== "stderr") {
      return;
    }

    const signals = detectLaunchOutputSignals(event.message);
    const detectedPorts = signals.ports.map((port) =>
      this.buildLaunchPort({
        projectId: event.projectId,
        runId: event.runId,
        source: port.source,
        host: port.host,
        port: port.port,
        url: port.url,
      }),
    );

    this.recordLaunchReadinessData(event.launchId, {
      urls: signals.urls.map((detected) => detected.url),
      ports: detectedPorts,
    });

    for (const detected of signals.urls) {
      const key = `${event.runId}:${detected.url}`;

      if (this.reportedDetectedUrls.has(key)) {
        continue;
      }

      this.reportedDetectedUrls.add(key);
      const parsed = RunEventSchema.parse({
        ...event,
        kind: "url-detected",
        message: `Detected app URL: ${detected.url}`,
        url: detected.url,
        timestamp: new Date().toISOString(),
      });
      this.handleRunEvent(parsed);
    }

    if (signals.portFallback) {
      const key = [
        event.runId,
        signals.portFallback.requestedPort,
        signals.portFallback.selectedPort,
        signals.portFallback.processId ?? "",
      ].join(":");

      if (!this.reportedPortFallbacks.has(key)) {
        this.reportedPortFallbacks.add(key);
        this.handleRunEvent(
          RunEventSchema.parse({
            ...event,
            kind: "port-remapped",
            message: signals.portFallback.processId
              ? `Port ${signals.portFallback.requestedPort} was busy in process ${signals.portFallback.processId}, so the dev server selected port ${signals.portFallback.selectedPort}.`
              : `Port ${signals.portFallback.requestedPort} was busy, so the dev server selected port ${signals.portFallback.selectedPort}.`,
            fromPort: signals.portFallback.requestedPort,
            toPort: signals.portFallback.selectedPort,
            processId: signals.portFallback.processId,
            timestamp: new Date().toISOString(),
          }),
        );
      }
    }

    if (
      signals.nextLockError &&
      !this.reportedNextLockErrors.has(event.runId)
    ) {
      this.reportedNextLockErrors.add(event.runId);
      this.handleRunEvent(
        RunEventSchema.parse({
          ...event,
          kind: "already-running",
          message:
            "Another Next.js dev server appears to already be running for this project. Stop the existing process or use the already running URL.",
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }

  private async createTerminalSession(
    project: Project,
    terminalStrategy: ProjectTerminalSession["terminalStrategy"],
    input: {
      launchId?: string;
      profileId?: string;
      activeRunId?: string;
      runIds: string[];
      status: ProjectTerminalSession["status"];
      terminalTitle?: string;
      lastMessage?: string;
      detectedUrls?: string[];
      detectedPorts?: ProjectLaunchPort[];
    },
  ): Promise<ProjectTerminalSession> {
    const now = new Date().toISOString();
    const session = await this.terminalSessionStore.upsertSession({
      projectId: project.id,
      projectName: project.name,
      projectPath: project.path,
      launchId: input.launchId,
      profileId: input.profileId,
      activeRunId: input.activeRunId,
      runIds: input.runIds,
      terminalStrategy,
      status: input.status,
      detectedUrls: input.detectedUrls ?? [],
      detectedPorts: input.detectedPorts ?? [],
      terminalTitle: input.terminalTitle,
      lastMessage: input.lastMessage,
      createdAt: now,
      updatedAt: now,
    });
    this.terminalSessionEvents.emit("terminal-session", session);
    this.refreshProjectPortRegistry(
      await this.terminalSessionStore.getSessions(),
    );
    return session;
  }

  private async updateTerminalSession(
    projectId: string,
    patch: Partial<Omit<ProjectTerminalSession, "projectId" | "createdAt">>,
  ): Promise<ProjectTerminalSession | null> {
    const session = await this.terminalSessionStore.updateSession(
      projectId,
      patch,
    );

    if (session) {
      this.terminalSessionEvents.emit("terminal-session", session);
      this.refreshProjectPortRegistry(
        await this.terminalSessionStore.getSessions(),
      );
    }

    return session;
  }

  private async clearTerminalSession(projectId: string): Promise<void> {
    const sessions = await this.terminalSessionStore.getSessions();
    const session = sessions.find((entry) => entry.projectId === projectId);
    if (session) {
      this.releaseSessionTracking(session);
    }

    await this.terminalSessionStore.clearSession(projectId);
    this.refreshProjectPortRegistry(
      await this.terminalSessionStore.getSessions(),
    );

    if (session) {
      this.terminalSessionEvents.emit("terminal-session", {
        ...session,
        status: "stopped",
        updatedAt: new Date().toISOString(),
      } satisfies ProjectTerminalSession);
    }
  }

  private releaseSessionTracking(session: ProjectTerminalSession): void {
    const runIds = new Set(session.runIds);

    if (session.activeRunId) {
      runIds.add(session.activeRunId);
    }

    for (const runId of runIds) {
      this.releaseActiveRun(runId);
      this.cleanupRunTracking(runId, session.launchId);
    }

    if (session.launchId) {
      this.runIdsByLaunch.delete(session.launchId);
      this.launchReadiness.delete(session.launchId);
    }

    this.stoppingProjectIds.delete(session.projectId);
  }

  private emitReadyEvent(
    projectId: string,
    launchId: string,
    runId: string,
    message: string,
    url?: string,
  ): void {
    this.emitRunEvent({
      runId,
      projectId,
      launchId,
      kind: "status",
      status: "ready",
      message,
      url,
      timestamp: new Date().toISOString(),
    });
  }

  private markLaunchReady(
    projectId: string,
    launchId: string,
    runId: string,
    message: string,
    url?: string,
  ): void {
    const readiness = this.launchReadiness.get(launchId);

    if (readiness?.readyEmitted) {
      return;
    }

    if (readiness) {
      const detectedPorts = url
        ? this.buildLaunchPortsFromUrls(projectId, [url], "generic", runId)
        : [];
      this.launchReadiness.set(launchId, {
        ...readiness,
        readyEmitted: true,
        detectedUrls: url
          ? [...new Set([...readiness.detectedUrls, url])]
          : readiness.detectedUrls,
        detectedPorts: mergeDetectedPorts(
          readiness.detectedPorts,
          detectedPorts,
        ),
      });
    }

    this.emitReadyEvent(projectId, launchId, runId, message, url);
  }

  private async updateTerminalSessionFromRunEvent(
    event: RunEvent,
  ): Promise<void> {
    const sessions = await this.terminalSessionStore.getSessions();
    const session = sessions.find(
      (entry) =>
        entry.projectId === event.projectId &&
        (entry.runIds.includes(event.runId) ||
          entry.launchId === event.launchId),
    );

    if (!session) {
      return;
    }

    if (event.kind === "url-detected" && event.url) {
      const currentUrls = session.detectedUrls ?? [];
      const currentPorts = session.detectedPorts ?? [];
      const detectedPorts = this.buildLaunchPortsFromUrls(
        event.projectId,
        [event.url],
        "generic",
        event.runId,
      );
      await this.updateTerminalSession(event.projectId, {
        detectedUrls: [...new Set([...currentUrls, event.url])],
        detectedPorts: mergeDetectedPorts(currentPorts, detectedPorts),
        lastMessage: event.message,
      });
      return;
    }

    if (event.kind === "port-remapped" && event.toPort) {
      const port = Number(event.toPort);

      if (Number.isInteger(port) && port > 0 && port <= 65_535) {
        await this.updateTerminalSession(event.projectId, {
          detectedPorts: mergeDetectedPorts(session.detectedPorts ?? [], [
            this.buildLaunchPort({
              projectId: event.projectId,
              runId: event.runId,
              source: "port-remap",
              host: "localhost",
              port,
              url:
                normalizeDiscoveredUrl(`http://localhost:${port}`) ??
                undefined,
              detectedAt: event.timestamp,
            }),
          ]),
          lastMessage: event.message,
        });
      }
      return;
    }

    if (event.kind !== "status") {
      return;
    }

    if (event.status === "ready") {
      const currentUrls = session.detectedUrls ?? [];
      const currentPorts = session.detectedPorts ?? [];
      const detectedPorts = event.url
        ? this.buildLaunchPortsFromUrls(
            event.projectId,
            [event.url],
            "generic",
            event.runId,
          )
        : [];
      await this.updateTerminalSession(event.projectId, {
        status: "ready",
        detectedUrls: event.url
          ? [...new Set([...currentUrls, event.url])]
          : currentUrls,
        detectedPorts: mergeDetectedPorts(currentPorts, detectedPorts),
        lastMessage: event.message,
      });
      return;
    }

    if (event.status === "failed") {
      await this.updateTerminalSession(event.projectId, {
        status: "failed",
        lastMessage: event.message,
      });
      return;
    }

    if (event.status === "completed" || event.status === "stopped") {
      const remainingActiveRuns = session.runIds.filter(
        (runId) => runId !== event.runId && this.activeRunMetadata.has(runId),
      );

      if (remainingActiveRuns.length === 0) {
        await this.clearTerminalSession(event.projectId);
      }
      return;
    }

    if (
      event.status === "started" ||
      event.status === "running" ||
      event.status === "spawned"
    ) {
      await this.updateTerminalSession(event.projectId, {
        status: "running",
        activeRunId: event.runId,
        lastMessage: event.message,
      });
    }
  }
}
