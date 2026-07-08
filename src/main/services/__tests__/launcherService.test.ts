import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  shell: {
    openPath: vi.fn(),
  },
}));

import { shell } from "electron";

import type {
  AppSettings,
  Project,
  ProjectTerminalSession,
} from "../../types/shared";
import { LauncherService } from "../launcherService";

describe("LauncherService", () => {
  let runEventListener: ((event: unknown) => void) | null = null;

  const project: Project = {
    id: "project-1",
    name: "Workspace",
    path: "/tmp/workspace",
    detectedType: "node",
    framework: "Vite",
    packageManager: "npm",
    detectedFiles: ["package.json"],
    suggestedCommands: [
      {
        label: "Development server",
        command: "npm run dev",
        cwd: "/tmp/workspace",
      },
    ],
    suggestedBrowserUrls: ["http://localhost:5173"],
    launchProfiles: [
      {
        id: "profile-1",
        name: "Default Launch",
        openEditor: true,
        openFolder: true,
        openBrowser: true,
        browserUrls: ["http://localhost:5173"],
        commandIds: ["command-1", "command-2"],
        askBeforeRun: true,
      },
    ],
    commands: [
      {
        id: "command-1",
        label: "Development server",
        command: "npm run dev",
        cwd: "/tmp/workspace",
        runOnLaunch: true,
      },
      {
        id: "command-2",
        label: "Install dependencies",
        command: "npm install",
        cwd: "/tmp/workspace",
        runOnLaunch: false,
      },
    ],
    notes: "",
    favorite: false,
    launchCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    missingFolder: false,
  };

  const settings: AppSettings = {
    defaultEditor: "vscode",
    terminalStrategy: "os-internal",
    telemetryEnabled: false,
    askBeforeRunningNewCommands: true,
    launchOnStartup: true,
    hasCompletedOnboarding: false,
  };

  const projectStore = {
    getProject: vi.fn(),
    updateProject: vi.fn(),
  };

  const settingsStore = {
    getSettings: vi.fn(),
  };

  const editorService = {
    openProjectEditor: vi.fn(),
    runCommandInEditorTerminal: vi.fn(),
  };

  const commandRunner = {
    runCommand: vi.fn(),
    stopRun: vi.fn(),
    revealExternalRun: vi.fn(),
    onRunEvent: vi.fn((listener: (event: unknown) => void) => {
      runEventListener = listener;
      return () => undefined;
    }),
  };

  const activityStore = {
    recordActivity: vi.fn(),
  };

  const externalUrlService = {
    openUrl: vi.fn(),
  };

  const subscriptionService = {
    getSubscriptionState: vi.fn(),
  };

  const commandSafetyService = {
    ensureCommandsAllowed: vi.fn(),
  };

  const desktopBridgeService = {
    hasConnectedEditorForPath: vi.fn(),
    runCommandInEditorTerminal: vi.fn(),
    stopEditorTerminalRun: vi.fn(),
    revealProjectTerminal: vi.fn(),
    onRunEvent: vi.fn(() => {
      return () => undefined;
    }),
  };

  const terminalSessionStore = {
    getSessions: vi.fn(),
    upsertSession: vi.fn((session: unknown) => Promise.resolve(session)),
    updateSession: vi.fn(
      (
        projectId: string,
        patch: Partial<
          Omit<ProjectTerminalSession, "projectId" | "createdAt">
        >,
      ): Promise<ProjectTerminalSession | null> =>
        Promise.resolve({
        projectId,
        projectName: project.name,
        projectPath: project.path,
          runIds: patch.runIds ?? ["run-1"],
          terminalStrategy: patch.terminalStrategy ?? "os-internal",
        status: patch.status ?? "running",
          detectedUrls: patch.detectedUrls ?? [],
          detectedPorts: patch.detectedPorts ?? [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        }),
    ),
    clearSession: vi.fn(),
  };

  function createLauncherService(): LauncherService {
    return new LauncherService(
      projectStore as never,
      settingsStore as never,
      editorService as never,
      commandRunner as never,
      activityStore as never,
      externalUrlService as never,
      subscriptionService as never,
      commandSafetyService as never,
      desktopBridgeService as never,
      terminalSessionStore as never,
    );
  }

  async function waitForAsyncLaunchWork(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  async function waitForDetectedUrlSettle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 550));
    await waitForAsyncLaunchWork();
  }

  function mockStoredTerminalSessions(initial: ProjectTerminalSession[]): {
    get sessions(): ProjectTerminalSession[];
  } {
    let sessions = initial;

    terminalSessionStore.getSessions.mockImplementation(() =>
      Promise.resolve(sessions),
    );
    terminalSessionStore.upsertSession.mockImplementation(
      (session: unknown) => {
        const parsed = session as ProjectTerminalSession;
        sessions = [
          parsed,
          ...sessions.filter((entry) => entry.projectId !== parsed.projectId),
        ];
        return Promise.resolve(parsed);
      },
    );
    terminalSessionStore.updateSession.mockImplementation(
      (projectId: string, patch: { status?: string }) => {
        const current = sessions.find((entry) => entry.projectId === projectId);
        const typedPatch = patch as Partial<
          Omit<ProjectTerminalSession, "projectId" | "createdAt">
        >;

        if (!current) {
          return Promise.resolve(null);
        }

        const next = {
          ...current,
          ...typedPatch,
          updatedAt: new Date().toISOString(),
        };
        sessions = [
          next,
          ...sessions.filter((entry) => entry.projectId !== projectId),
        ];
        return Promise.resolve(next);
      },
    );
    terminalSessionStore.clearSession.mockImplementation((projectId: string) => {
      sessions = sessions.filter((entry) => entry.projectId !== projectId);
      return Promise.resolve();
    });

    return {
      get sessions() {
        return sessions;
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200 }));
    runEventListener = null;
    projectStore.getProject.mockResolvedValue(project);
    projectStore.updateProject.mockResolvedValue(project);
    settingsStore.getSettings.mockResolvedValue(settings);
    subscriptionService.getSubscriptionState.mockResolvedValue({
      plan: "pro",
      status: "active",
      entitlements: {
        maxProjects: null,
        canChangeProjectDirectories: true,
        maxConcurrentLaunches: null,
        canBulkImport: true,
        canBulkScan: true,
        projectStorage: "firestore",
        requiresOnline: true,
        projectDetectionLevel: "advanced",
        defaultDirectoryLimit: null,
        canChangeDefaultDirectories: true,
      },
    });
    commandRunner.runCommand.mockResolvedValue({
      runId: "run-1",
      commandId: "command-1",
      status: "started",
      executionMode: "os-internal",
      managed: true,
    });
    commandRunner.stopRun.mockReturnValue(true);
    terminalSessionStore.getSessions.mockResolvedValue([]);
    terminalSessionStore.upsertSession.mockImplementation((session) =>
      Promise.resolve(session),
    );
    terminalSessionStore.clearSession.mockResolvedValue(undefined);
    vi.mocked(shell.openPath).mockResolvedValue("");
    externalUrlService.openUrl.mockResolvedValue(undefined);
    editorService.runCommandInEditorTerminal.mockResolvedValue(undefined);
    commandSafetyService.ensureCommandsAllowed.mockResolvedValue(undefined);
    desktopBridgeService.hasConnectedEditorForPath.mockReturnValue(true);
    desktopBridgeService.runCommandInEditorTerminal.mockResolvedValue({
      runId: "editor-run-1",
      commandId: "command-1",
      status: "started",
      executionMode: "vscode-internal",
      managed: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("launches a profile and only runs commands marked for launch", async () => {
    const launcherService = createLauncherService();

    const result = await launcherService.launchProfile(project.id, "profile-1");

    expect(editorService.openProjectEditor).toHaveBeenCalledWith(
      project,
      settings,
      { reuseWindow: false },
    );
    expect(shell.openPath).toHaveBeenCalledWith(project.path);
    expect(externalUrlService.openUrl).not.toHaveBeenCalled();
    runEventListener?.({
      runId: "run-1",
      projectId: project.id,
      launchId: result.launchId,
      profileId: "profile-1",
      commandId: "command-1",
      kind: "stdout",
      message: "ready - local: http://localhost:5173\n",
      timestamp: new Date().toISOString(),
    });
    await waitForDetectedUrlSettle();
    expect(externalUrlService.openUrl).toHaveBeenCalledWith(
      "http://localhost:5173/",
    );
    expect(commandRunner.runCommand).toHaveBeenCalledTimes(1);
    expect(commandRunner.runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({ id: "command-1" }),
        terminalStrategy: "os-internal",
      }),
    );
    expect(projectStore.updateProject).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({ lastOpenedAt: expect.any(String) }),
    );
    expect(result.commandRunIds).toEqual(["run-1"]);
  });

  it("rejects launch profiles for projects locked by Standard access", async () => {
    projectStore.getProject.mockResolvedValue({
      ...project,
      lockedBySubscription: true,
      subscriptionLockReason: "standard_project_limit",
      subscriptionRank: 6,
      subscriptionLimit: 5,
    });
    const launcherService = createLauncherService();

    await expect(
      launcherService.launchProfile(project.id, "profile-1"),
    ).rejects.toThrow("UPGRADE_REQUIRED:lockedProject");
    expect(subscriptionService.getSubscriptionState).not.toHaveBeenCalled();
    expect(commandSafetyService.ensureCommandsAllowed).not.toHaveBeenCalled();
    expect(commandRunner.runCommand).not.toHaveBeenCalled();
    expect(projectStore.updateProject).not.toHaveBeenCalled();
  });

  it("rejects manual commands for projects locked by Standard access", async () => {
    projectStore.getProject.mockResolvedValue({
      ...project,
      lockedBySubscription: true,
      subscriptionLockReason: "standard_project_limit",
      subscriptionRank: 6,
      subscriptionLimit: 5,
    });
    const launcherService = createLauncherService();

    await expect(
      launcherService.runCommand(project.id, "command-1"),
    ).rejects.toThrow("UPGRADE_REQUIRED:lockedProject");
    expect(subscriptionService.getSubscriptionState).not.toHaveBeenCalled();
    expect(commandSafetyService.ensureCommandsAllowed).not.toHaveBeenCalled();
    expect(commandRunner.runCommand).not.toHaveBeenCalled();
    expect(projectStore.updateProject).not.toHaveBeenCalled();
  });

  it("opens dynamically detected URLs even when the profile has no configured browser URLs", async () => {
    projectStore.getProject.mockResolvedValue({
      ...project,
      launchProfiles: [
        {
          ...project.launchProfiles[0],
          browserUrls: [],
        },
      ],
    });
    const launcherService = createLauncherService();

    const result = await launcherService.launchProfile(project.id, "profile-1");
    runEventListener?.({
      runId: "run-1",
      projectId: project.id,
      launchId: result.launchId,
      profileId: "profile-1",
      commandId: "command-1",
      kind: "stdout",
      message: "Local: http://localhost:3009\n",
      timestamp: new Date().toISOString(),
      executionMode: "os-internal",
      managed: false,
    });
    await waitForDetectedUrlSettle();

    expect(externalUrlService.openUrl).toHaveBeenCalledWith(
      "http://localhost:3009/",
    );
  });

  it("opens only the best reachable terminal-detected app URL", async () => {
    projectStore.getProject.mockResolvedValue({
      ...project,
      launchProfiles: [
        {
          ...project.launchProfiles[0],
          browserUrls: [],
        },
      ],
    });
    const launcherService = createLauncherService();

    const result = await launcherService.launchProfile(project.id, "profile-1");
    runEventListener?.({
      runId: "run-1",
      projectId: project.id,
      launchId: result.launchId,
      profileId: "profile-1",
      commandId: "command-1",
      kind: "stdout",
      message: [
        "Local: http://localhost:3009",
        "Network: http://127.0.0.1:3010",
      ].join("\n"),
      timestamp: new Date().toISOString(),
      executionMode: "os-internal",
      managed: false,
    });
    await waitForDetectedUrlSettle();

    expect(externalUrlService.openUrl).toHaveBeenCalledWith(
      "http://localhost:3009/",
    );
    expect(externalUrlService.openUrl).not.toHaveBeenCalledWith(
      "http://127.0.0.1:3010/",
    );
  });

  it("trusts detected fallback ports over configured localhost URLs", async () => {
    projectStore.getProject.mockResolvedValue({
      ...project,
      launchProfiles: [
        {
          ...project.launchProfiles[0],
          browserUrls: ["http://localhost:3000"],
        },
      ],
    });
    const launcherService = createLauncherService();

    const result = await launcherService.launchProfile(project.id, "profile-1");
    runEventListener?.({
      runId: "run-1",
      projectId: project.id,
      launchId: result.launchId,
      profileId: "profile-1",
      commandId: "command-1",
      kind: "stdout",
      message:
        "Port 3000 is in use, using available port 3001 instead.\nLocal: http://localhost:3001\n",
      timestamp: new Date().toISOString(),
      executionMode: "os-internal",
      managed: false,
    });
    await waitForDetectedUrlSettle();

    expect(externalUrlService.openUrl).toHaveBeenCalledTimes(1);
    expect(externalUrlService.openUrl).toHaveBeenCalledWith(
      "http://localhost:3001/",
    );
    expect(externalUrlService.openUrl).not.toHaveBeenCalledWith(
      "http://localhost:3000/",
    );
  });

  it("emits structured port-remapped and already-running run events", async () => {
    const launcherService = createLauncherService();
    const events: unknown[] = [];
    launcherService.onRunEvent((event) => {
      events.push(event);
    });

    const result = await launcherService.launchProfile(project.id, "profile-1");
    runEventListener?.({
      runId: "run-1",
      projectId: project.id,
      launchId: result.launchId,
      profileId: "profile-1",
      commandId: "command-1",
      kind: "stderr",
      message: [
        "Port 3000 is in use by process 34332, using available port 3003 instead.",
        "Unable to acquire lock at /tmp/workspace/.next/dev/lock, is another instance of next dev running?",
      ].join("\n"),
      timestamp: new Date().toISOString(),
      executionMode: "os-internal",
      managed: false,
    });

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "url-detected",
          url: "http://localhost:3003/",
        }),
        expect.objectContaining({
          kind: "port-remapped",
          fromPort: "3000",
          toPort: "3003",
          processId: "34332",
        }),
        expect.objectContaining({
          kind: "already-running",
        }),
      ]),
    );
    await waitForDetectedUrlSettle();
  });

  it("repairs stale default launch selections by falling back to runnable commands", async () => {
    projectStore.getProject.mockResolvedValue({
      ...project,
      launchProfiles: [
        {
          ...project.launchProfiles[0],
          commandIds: [],
        },
      ],
    });

    const launcherService = createLauncherService();

    await launcherService.launchProfile(project.id, "profile-1");

    expect(commandRunner.runCommand).toHaveBeenCalledTimes(1);
    expect(commandRunner.runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.objectContaining({ id: "command-1" }),
      }),
    );
  });

  it("runs a single command with the active terminal strategy", async () => {
    const launcherService = createLauncherService();

    const result = await launcherService.runCommand(project.id, "command-1");

    expect(commandRunner.runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: project.id,
        terminalStrategy: "os-internal",
        projectName: project.name,
        command: expect.objectContaining({ id: "command-1" }),
      }),
    );
    expect(result.runId).toBe("run-1");
  });

  it("reveals a mapped OS terminal and marks the project session as stopping", async () => {
    const session = {
      projectId: project.id,
      projectName: project.name,
      projectPath: project.path,
      launchId: "launch-1",
      activeRunId: "run-1",
      runIds: ["run-1"],
      terminalStrategy: "os-external",
      status: "ready",
      detectedUrls: ["http://localhost:5173/"],
      terminalTitle: "Projecto: Workspace (run-1)",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    terminalSessionStore.getSessions.mockResolvedValue([session]);
    commandRunner.revealExternalRun.mockResolvedValue(true);
    const launcherService = createLauncherService();

    const result = await launcherService.revealProjectTerminal(project.id);

    expect(result).toEqual(session);
    expect(commandRunner.revealExternalRun).toHaveBeenCalledWith(
      "run-1",
      session.terminalTitle,
    );
    expect(terminalSessionStore.updateSession).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        status: "stopping",
        lastMessage: expect.stringContaining("OS terminal window revealed"),
      }),
    );
  });

  it("clears stale OS terminal mappings when the window cannot be revealed", async () => {
    terminalSessionStore.getSessions.mockResolvedValue([
      {
        projectId: project.id,
        projectName: project.name,
        projectPath: project.path,
        activeRunId: "run-1",
        runIds: ["run-1"],
        terminalStrategy: "os-external",
        status: "ready",
        detectedUrls: [],
        terminalTitle: "Projecto: Workspace (run-1)",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    commandRunner.revealExternalRun.mockResolvedValue(false);
    const launcherService = createLauncherService();

    await expect(
      launcherService.revealProjectTerminal(project.id),
    ).rejects.toThrow("mapped OS terminal could not be found");
    expect(terminalSessionStore.clearSession).toHaveBeenCalledWith(project.id);
  });

  it("stops a mapped OS project session through Projecto", async () => {
    const session: ProjectTerminalSession = {
      projectId: project.id,
      projectName: project.name,
      projectPath: project.path,
      launchId: "launch-1",
      activeRunId: "run-1",
      runIds: ["run-1"],
      terminalStrategy: "os-internal",
      status: "ready",
      detectedUrls: ["http://localhost:5173/"],
      detectedPorts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    terminalSessionStore.getSessions.mockResolvedValue([session]);
    const launcherService = createLauncherService();

    runEventListener?.({
      runId: "run-1",
      projectId: project.id,
      launchId: "launch-1",
      commandId: "command-1",
      kind: "status",
      status: "ready",
      message: "Ready at http://localhost:5173/",
      url: "http://localhost:5173/",
      timestamp: new Date().toISOString(),
      executionMode: "os-internal",
      managed: true,
    });

    await expect(
      launcherService.stopProjectTerminal(project.id),
    ).resolves.toBe(true);
    expect(terminalSessionStore.updateSession).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        status: "stopping",
        lastMessage: "Stopping project from Projecto.",
      }),
    );
    expect(commandRunner.stopRun).toHaveBeenCalledWith("run-1");
    expect(commandRunner.revealExternalRun).not.toHaveBeenCalled();
  });

  it("allows relaunch after a stale OS terminal reveal clears a ready session", async () => {
    const storedSessions = mockStoredTerminalSessions([
      {
        projectId: project.id,
        projectName: project.name,
        projectPath: project.path,
        launchId: "launch-1",
        activeRunId: "run-1",
        runIds: ["run-1"],
        terminalStrategy: "os-external",
        status: "ready",
        detectedUrls: ["http://localhost:5173/"],
        detectedPorts: [
          {
            projectId: project.id,
            runId: "run-1",
            host: "localhost",
            port: 5173,
            url: "http://localhost:5173/",
            source: "local",
            detectedAt: new Date().toISOString(),
          },
        ],
        terminalTitle: "Projecto: Workspace (run-1)",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    const launcherService = createLauncherService();

    runEventListener?.({
      runId: "run-1",
      projectId: project.id,
      launchId: "launch-1",
      commandId: "command-1",
      kind: "status",
      status: "ready",
      message: "Ready at http://localhost:5173/",
      url: "http://localhost:5173/",
      timestamp: new Date().toISOString(),
      executionMode: "os-external",
      managed: false,
    });
    await waitForAsyncLaunchWork();

    commandRunner.revealExternalRun.mockResolvedValue(false);
    await expect(
      launcherService.revealProjectTerminal(project.id),
    ).rejects.toThrow("mapped OS terminal could not be found");
    expect(storedSessions.sessions).toEqual([]);

    commandRunner.runCommand.mockClear();
    await launcherService.launchProfile(project.id, "profile-1");

    expect(commandRunner.runCommand).toHaveBeenCalledTimes(1);
  });

  it("persists ready and failed terminal-session transitions from run status events", async () => {
    terminalSessionStore.getSessions.mockResolvedValue([
      {
        projectId: project.id,
        projectName: project.name,
        projectPath: project.path,
        launchId: "launch-1",
        activeRunId: "run-1",
        runIds: ["run-1"],
        terminalStrategy: "os-internal",
        status: "running",
        detectedUrls: [],
        terminalTitle: "Projecto: Workspace (run-1)",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    createLauncherService();

    runEventListener?.({
      runId: "run-1",
      projectId: project.id,
      launchId: "launch-1",
      commandId: "command-1",
      kind: "status",
      status: "ready",
      message: "Ready at http://localhost:5173/",
      url: "http://localhost:5173/",
      timestamp: new Date().toISOString(),
      executionMode: "os-internal",
      managed: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    runEventListener?.({
      runId: "run-1",
      projectId: project.id,
      launchId: "launch-1",
      commandId: "command-1",
      kind: "status",
      status: "failed",
      message: "OS terminal command exited with code 1.",
      exitCode: 1,
      timestamp: new Date().toISOString(),
      executionMode: "os-internal",
      managed: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(terminalSessionStore.updateSession).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        status: "ready",
        detectedUrls: ["http://localhost:5173/"],
      }),
    );
    expect(terminalSessionStore.updateSession).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({
        status: "failed",
        lastMessage: "OS terminal command exited with code 1.",
      }),
    );
  });

  it("opens a dedicated editor window and runs commands in the editor terminal strategy", async () => {
    settingsStore.getSettings.mockResolvedValue({
      ...settings,
      terminalStrategy: "vscode-internal",
    });

    const launcherService = createLauncherService();

    await launcherService.launchProfile(project.id, "profile-1");

    expect(editorService.openProjectEditor).toHaveBeenCalledWith(
      project,
      {
        ...settings,
        terminalStrategy: "vscode-internal",
      },
      undefined,
    );
    expect(
      desktopBridgeService.runCommandInEditorTerminal,
    ).toHaveBeenCalledWith(
      project,
      expect.objectContaining({ id: "command-1" }),
      expect.objectContaining({
        profileId: "profile-1",
        terminalLocation: "panel",
      }),
    );
    expect(commandRunner.runCommand).not.toHaveBeenCalled();
  });

  it("waits for the extension to register a newly opened editor workspace", async () => {
    settingsStore.getSettings.mockResolvedValue({
      ...settings,
      terminalStrategy: "vscode-internal",
    });
    desktopBridgeService.hasConnectedEditorForPath
      .mockReturnValueOnce(false)
      .mockReturnValue(true);

    const launcherService = createLauncherService();

    await launcherService.launchProfile(project.id, "profile-1");

    expect(editorService.openProjectEditor).toHaveBeenCalledWith(
      project,
      {
        ...settings,
        terminalStrategy: "vscode-internal",
      },
      undefined,
    );
    expect(
      desktopBridgeService.hasConnectedEditorForPath,
    ).toHaveBeenCalledWith(project.path);
    expect(
      desktopBridgeService.runCommandInEditorTerminal,
    ).toHaveBeenCalledWith(
      project,
      expect.objectContaining({ id: "command-1" }),
      expect.objectContaining({
        profileId: "profile-1",
        terminalLocation: "panel",
      }),
    );
  });

  it("opens the editor before direct saved-command runs in editor terminal mode", async () => {
    settingsStore.getSettings.mockResolvedValue({
      ...settings,
      terminalStrategy: "vscode-internal",
    });
    desktopBridgeService.hasConnectedEditorForPath
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    const launcherService = createLauncherService();

    const result = await launcherService.runCommand(project.id, "command-1");

    expect(result.executionMode).toBe("vscode-internal");
    expect(editorService.openProjectEditor).toHaveBeenCalledWith(project, {
      ...settings,
      terminalStrategy: "vscode-internal",
    });
    expect(
      desktopBridgeService.runCommandInEditorTerminal,
    ).toHaveBeenCalledWith(
      project,
      expect.objectContaining({ id: "command-1" }),
      expect.objectContaining({
        profileId: undefined,
        terminalLocation: "panel",
      }),
    );
    expect(commandRunner.runCommand).not.toHaveBeenCalled();
  });

  it("routes VS Code external mode to an editor-area terminal", async () => {
    settingsStore.getSettings.mockResolvedValue({
      ...settings,
      terminalStrategy: "vscode-external",
    });
    desktopBridgeService.runCommandInEditorTerminal.mockResolvedValue({
      runId: "editor-run-1",
      commandId: "command-1",
      status: "started",
      executionMode: "vscode-external",
      managed: true,
    });
    const launcherService = createLauncherService();

    await launcherService.launchProfile(project.id, "profile-1");

    expect(
      desktopBridgeService.runCommandInEditorTerminal,
    ).toHaveBeenCalledWith(
      project,
      expect.objectContaining({ id: "command-1" }),
      expect.objectContaining({
        profileId: "profile-1",
        terminalLocation: "editor",
      }),
    );
  });

  it("blocks launching the same long-running command twice", async () => {
    const launcherService = createLauncherService();

    runEventListener?.({
      runId: "run-active",
      projectId: project.id,
      commandId: "command-1",
      kind: "status",
      status: "started",
      message: "Running npm run dev",
      timestamp: new Date().toISOString(),
    });

    await expect(
      launcherService.launchProfile(project.id, "profile-1"),
    ).rejects.toThrow("PROJECT_ALREADY_RUNNING:project-1");
    expect(commandRunner.runCommand).not.toHaveBeenCalled();
  });

  it("rejects duplicate launches when a project already has a mapped terminal", async () => {
    terminalSessionStore.getSessions.mockResolvedValue([
      {
        projectId: project.id,
        projectName: project.name,
        projectPath: project.path,
        activeRunId: "run-1",
        runIds: ["run-1"],
        terminalStrategy: "os-internal",
        status: "ready",
        detectedUrls: ["http://localhost:5173/"],
        detectedPorts: [
          {
            projectId: project.id,
            runId: "run-1",
            host: "localhost",
            port: 5173,
            url: "http://localhost:5173/",
            source: "local",
            detectedAt: new Date().toISOString(),
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    const launcherService = createLauncherService();

    await expect(
      launcherService.launchProfile(project.id, "profile-1"),
    ).rejects.toThrow("PROJECT_ALREADY_RUNNING:project-1");
    expect(commandRunner.runCommand).not.toHaveBeenCalled();
  });

  it("rejects Projecto-owned port conflicts from another mapped project", async () => {
    terminalSessionStore.getSessions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          projectId: "project-2",
          projectName: "Other Workspace",
          projectPath: "/tmp/other",
          activeRunId: "run-2",
          runIds: ["run-2"],
          terminalStrategy: "os-internal",
          status: "ready",
          detectedUrls: ["http://localhost:5173/"],
          detectedPorts: [
            {
              projectId: "project-2",
              runId: "run-2",
              host: "localhost",
              port: 5173,
              url: "http://localhost:5173/",
              source: "local",
              detectedAt: new Date().toISOString(),
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);
    const launcherService = createLauncherService();

    await expect(
      launcherService.launchProfile(project.id, "profile-1"),
    ).rejects.toThrow("PROJECT_PORT_OWNED:5173:project-2");
    expect(commandRunner.runCommand).not.toHaveBeenCalled();
  });

  it("does not treat configured fallback ports as owned by another project", async () => {
    terminalSessionStore.getSessions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          projectId: "project-2",
          projectName: "Other Workspace",
          projectPath: "/tmp/other",
          activeRunId: "run-2",
          runIds: ["run-2"],
          terminalStrategy: "os-internal",
          status: "ready",
          detectedUrls: ["http://localhost:5174/"],
          detectedPorts: [
            {
              projectId: "project-2",
              host: "localhost",
              port: 5173,
              url: "http://localhost:5173/",
              source: "configured",
              detectedAt: new Date().toISOString(),
            },
            {
              projectId: "project-2",
              runId: "run-2",
              host: "localhost",
              port: 5174,
              url: "http://localhost:5174/",
              source: "port-remap",
              detectedAt: new Date().toISOString(),
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])
      .mockResolvedValue([]);
    const launcherService = createLauncherService();

    await launcherService.launchProfile(project.id, "profile-1");

    expect(commandRunner.runCommand).toHaveBeenCalledTimes(1);
  });

  it("ignores non-local configured URLs when checking Projecto-owned ports", async () => {
    projectStore.getProject.mockResolvedValue({
      ...project,
      launchProfiles: [
        {
          ...project.launchProfiles[0],
          browserUrls: ["https://example.com"],
        },
      ],
    });
    terminalSessionStore.getSessions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          projectId: "project-2",
          projectName: "Other Workspace",
          projectPath: "/tmp/other",
          activeRunId: "run-2",
          runIds: ["run-2"],
          terminalStrategy: "os-internal",
          status: "ready",
          detectedUrls: ["https://example.com/"],
          detectedPorts: [
            {
              projectId: "project-2",
              runId: "run-2",
              host: "example.com",
              port: 443,
              url: "https://example.com/",
              source: "configured",
              detectedAt: new Date().toISOString(),
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ])
      .mockResolvedValue([]);
    const launcherService = createLauncherService();

    await launcherService.launchProfile(project.id, "profile-1");

    expect(commandRunner.runCommand).toHaveBeenCalledTimes(1);
  });

  it("counts persisted active terminal sessions against concurrent launch limits", async () => {
    subscriptionService.getSubscriptionState.mockResolvedValue({
      plan: "free",
      status: "active",
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
    });
    terminalSessionStore.getSessions.mockResolvedValue([
      {
        projectId: "project-2",
        projectName: "Other Workspace",
        projectPath: "/tmp/other",
        activeRunId: "run-2",
        runIds: ["run-2"],
        terminalStrategy: "os-internal",
        status: "ready",
        detectedUrls: ["http://localhost:5174/"],
        detectedPorts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    const launcherService = createLauncherService();

    await expect(
      launcherService.launchProfile(project.id, "profile-1"),
    ).rejects.toThrow("UPGRADE_REQUIRED:concurrentLaunches");
    expect(commandRunner.runCommand).not.toHaveBeenCalled();
  });

  it("stops started background runs when a later profile command fails", async () => {
    projectStore.getProject.mockResolvedValue({
      ...project,
      launchProfiles: [
        {
          ...project.launchProfiles[0],
          commandIds: ["command-1", "command-2"],
        },
      ],
      commands: project.commands.map((command) => ({
        ...command,
        runOnLaunch: true,
      })),
    });
    commandRunner.runCommand
      .mockResolvedValueOnce({
        runId: "run-1",
        commandId: "command-1",
        status: "spawned",
        executionMode: "os-internal",
        managed: true,
      })
      .mockRejectedValueOnce(new Error("Second command failed"));
    const launcherService = createLauncherService();
    const events: unknown[] = [];
    launcherService.onRunEvent((event) => {
      events.push(event);
    });

    await expect(
      launcherService.launchProfile(project.id, "profile-1"),
    ).rejects.toThrow("Second command failed");

    expect(terminalSessionStore.clearSession).toHaveBeenCalledWith(project.id);
    expect(commandRunner.stopRun).toHaveBeenCalledWith("run-1");
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "status",
          status: "failed",
        }),
      ]),
    );
  });

  it("surfaces a missing-folder error before trying to open the editor", async () => {
    projectStore.getProject.mockResolvedValue({
      ...project,
      missingFolder: true,
    });

    const launcherService = createLauncherService();

    await expect(launcherService.openEditor(project.id)).rejects.toThrow(
      "Project folder is missing.",
    );
    expect(editorService.openProjectEditor).not.toHaveBeenCalled();
  });
});
