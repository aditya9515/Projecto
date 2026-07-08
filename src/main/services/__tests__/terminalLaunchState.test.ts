import { describe, expect, it } from "vitest";

import type {
  AppSettings,
  DesktopBridgeState,
  Project,
  ProjectTerminalSession,
} from "../../types/shared";
import { getProjectHealthStatus } from "../../../renderer/utils/projectHealth";
import {
  formatTerminalStrategyLabel,
  getProjectLaunchButtonState,
} from "../../../renderer/utils/terminalSessions";

describe("renderer terminal launch-state helpers", () => {
  const project: Project = {
    id: "project-1",
    name: "Workspace",
    path: "D:/workspace",
    detectedType: "node",
    framework: "Vite",
    packageManager: "npm",
    detectedFiles: ["package.json"],
    suggestedCommands: [],
    suggestedBrowserUrls: [],
    launchProfiles: [
      {
        id: "profile-1",
        name: "Default Launch",
        openEditor: false,
        openFolder: false,
        openBrowser: true,
        browserUrls: [],
        commandIds: [],
        askBeforeRun: false,
      },
    ],
    commands: [],
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
    hasCompletedOnboarding: true,
  };
  const bridgeState: DesktopBridgeState = {
    status: "connected",
    host: "127.0.0.1",
    protocolVersion: "0.1.0",
    extensionConnected: true,
    registeredWorkspaceCount: 1,
  };

  function session(
    status: ProjectTerminalSession["status"],
    terminalStrategy: ProjectTerminalSession["terminalStrategy"] = "os-internal",
  ): ProjectTerminalSession {
    return {
      projectId: project.id,
      projectName: project.name,
      projectPath: project.path,
      runIds: ["run-1"],
      activeRunId: "run-1",
      terminalStrategy,
      status,
      detectedUrls: [],
      detectedPorts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  it("maps persisted terminal sessions to launch button states", () => {
    expect(getProjectLaunchButtonState(project)).toBe("launch");
    expect(getProjectLaunchButtonState(project, session("running"))).toBe(
      "running",
    );
    expect(getProjectLaunchButtonState(project, session("ready"))).toBe(
      "ready",
    );
    expect(getProjectLaunchButtonState(project, session("stopping"))).toBe(
      "stopping",
    );
    expect(getProjectLaunchButtonState(project, session("failed"))).toBe(
      "failed",
    );
    expect(getProjectLaunchButtonState(project, session("stopped"))).toBe(
      "launch",
    );
  });

  it("disables launches when a project cannot run and formats the terminal modes", () => {
    expect(
      getProjectLaunchButtonState(
        { ...project, missingFolder: true },
        session("ready"),
      ),
    ).toBe("disabled");
    expect(
      getProjectLaunchButtonState(
        { ...project, launchProfiles: [] },
        session("ready"),
      ),
    ).toBe("disabled");
    expect(
      getProjectLaunchButtonState(
        { ...project, lockedBySubscription: true },
        session("ready"),
      ),
    ).toBe("locked");
    expect(formatTerminalStrategyLabel(session("ready", "os-internal"))).toBe(
      "OS Terminal",
    );
    expect(formatTerminalStrategyLabel(session("ready", "os-external"))).toBe(
      "OS Terminal",
    );
    expect(
      formatTerminalStrategyLabel(session("ready", "vscode-internal")),
    ).toBe("VS Code Terminal");
    expect(
      formatTerminalStrategyLabel(session("ready", "vscode-external")),
    ).toBe("VS Code Terminal");
  });

  it("marks locked projects as locked before other health checks", () => {
    expect(
      getProjectHealthStatus({
        project: {
          ...project,
          lockedBySubscription: true,
          missingFolder: true,
        },
        settings,
        bridgeState,
      }),
    ).toBe("locked");
  });
});
