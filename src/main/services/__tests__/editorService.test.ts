import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";

import type { AppSettings, Project } from "../../types/shared";
import { EditorService } from "../editorService";

function createSpawnedChild(): EventEmitter & {
  unref: ReturnType<typeof vi.fn>;
} {
  const child = new EventEmitter() as EventEmitter & {
    unref: ReturnType<typeof vi.fn>;
  };
  child.unref = vi.fn();
  queueMicrotask(() => {
    child.emit("spawn");
  });
  return child;
}

function createErroredChild(
  code: string,
  message: string,
): EventEmitter & { unref: ReturnType<typeof vi.fn> } {
  const child = new EventEmitter() as EventEmitter & {
    unref: ReturnType<typeof vi.fn>;
  };
  child.unref = vi.fn();
  queueMicrotask(() => {
    child.emit("error", Object.assign(new Error(message), { code }));
  });
  return child;
}

describe("EditorService", () => {
  const project: Project = {
    id: "project-1",
    name: "Workspace",
    path: "D:/projecto",
    detectedType: "node",
    framework: "Vite",
    packageManager: "npm",
    detectedFiles: ["package.json"],
    suggestedCommands: [],
    suggestedBrowserUrls: [],
    launchProfiles: [],
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
    terminalStrategy: "os-external",
    telemetryEnabled: false,
    askBeforeRunningNewCommands: true,
    launchOnStartup: true,
    hasCompletedOnboarding: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses cmd.exe to launch Windows command-script editors safely", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });

    vi.mocked(spawn).mockImplementation(() => createSpawnedChild() as never);

    const service = new EditorService();
    await service.openProjectEditor(project, settings);

    expect(spawn).toHaveBeenCalledWith(
      "cmd.exe",
      ["/d", "/c", "code.cmd", project.path],
      expect.objectContaining({
        detached: true,
        stdio: "ignore",
      }),
    );

    Object.defineProperty(process, "platform", {
      configurable: true,
      value: originalPlatform,
    });
  });

  it("shows the helpful missing-editor message when the command does not exist", async () => {
    vi.mocked(spawn).mockImplementation(
      () => createErroredChild("ENOENT", "spawn ENOENT") as never,
    );

    const service = new EditorService();

    await expect(service.openProjectEditor(project, settings)).rejects.toThrow(
      "VS Code command not found. Install VS Code and make sure the code command is available on PATH.",
    );
  });
});
