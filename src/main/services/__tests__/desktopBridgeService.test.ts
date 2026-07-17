import { describe, expect, it } from "vitest";

import type { LaunchCommand, Project, RunEvent } from "../../types/shared";
import { DesktopBridgeService } from "../desktopBridgeService";

function makeProject(): Project {
  return {
    id: "project-1",
    name: "Project One",
    path: "D:/workspace",
    detectedType: "node",
    detectedFiles: [],
    suggestedCommands: [],
    suggestedBrowserUrls: [],
    launchProfiles: [],
    commands: [],
    notes: "",
    favorite: false,
    launchCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeCommand(): LaunchCommand {
  return {
    id: "command-1",
    label: "Dev",
    command: "npm run dev",
    cwd: ".",
    runOnLaunch: true,
  };
}

describe("DesktopBridgeService", () => {
  it("keeps legacy terminal compatibility disabled in Windows Terminal mode", async () => {
    const service = new DesktopBridgeService(
      {} as never,
      {} as never,
      "D:/projecto-user-data",
    );

    await service.start();

    expect(service.getState()).toMatchObject({
      status: "stopped",
      extensionConnected: false,
      registeredWorkspaceCount: 0,
    });
    expect(service.hasConnectedEditorForPath("D:/workspace")).toBe(false);
    await expect(
      service.revealProjectTerminal({
        projectId: "project-1",
        projectPath: "D:/workspace",
        runId: "run-1",
      }),
    ).resolves.toBe(false);
    expect(service.stopEditorTerminalRun("run-1")).toBe(false);
    expect(service.getDiscoveryHint()).toContain("Windows Terminal");
  });

  it("reports disabled non-Windows-terminal execution as a failed run", async () => {
    const service = new DesktopBridgeService(
      {} as never,
      {} as never,
      "D:/projecto-user-data",
    );
    const events: RunEvent[] = [];
    service.onRunEvent((event) => events.push(event));

    const result = await service.runCommandInEditorTerminal(
      makeProject(),
      makeCommand(),
    );

    expect(result).toMatchObject({
      commandId: "command-1",
      status: "failed",
      executionMode: "os-external",
      managed: true,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      projectId: "project-1",
      commandId: "command-1",
      status: "failed",
      executionMode: "os-external",
    });
  });
});