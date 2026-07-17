import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";

import type { LaunchCommand } from "../../types/shared";
import { CommandRunner } from "../commandRunner";

type MockChild = EventEmitter & {
  kill: ReturnType<typeof vi.fn>;
  unref: ReturnType<typeof vi.fn>;
  pid?: number;
};

function createChild(pid = 4242): MockChild {
  const child = new EventEmitter() as MockChild;
  child.kill = vi.fn();
  child.unref = vi.fn();
  child.pid = pid;

  queueMicrotask(() => {
    child.emit("spawn");
  });

  return child;
}

describe("CommandRunner", () => {
  const command: LaunchCommand = {
    id: "command-1",
    label: "Development server",
    command: "npm run dev",
    cwd: "D:/projects/example-app",
    runOnLaunch: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts commands in a visible Windows Terminal with mirrored output", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });

    try {
      const runsDirectory = path.join(
        os.tmpdir(),
        `projecto-command-runner-test-${Date.now()}`,
      );
      vi.mocked(spawn).mockImplementation(() => createChild() as never);
      const runner = new CommandRunner(runsDirectory);
      const events: unknown[] = [];
      runner.onRunEvent((event) => events.push(event));

      const result = await runner.runCommand({
        projectId: "project-1",
        projectName: "Example App",
        projectPath: "D:/projects/example-app",
        command,
        terminalStrategy: "os-external",
      });

      expect(spawn).toHaveBeenCalledWith(
        "wt.exe",
        expect.arrayContaining([
          "-d",
          "D:/projects/example-app",
          "--title",
          expect.stringContaining("Projecto: Example App"),
          "--suppressApplicationTitle",
        ]),
        expect.objectContaining({ detached: true, stdio: "ignore" }),
      );
      const script = await fs.readFile(
        path.join(runsDirectory, `${result.runId}.ps1`),
        "utf8",
      );
      expect(script).toContain(`${result.runId}.process`);
      expect(script).toContain("GetCurrentProcess().StartTime.ToFileTimeUtc()");
      expect(result).toEqual(
        expect.objectContaining({
          commandId: "command-1",
          executionMode: "os-external",
          managed: false,
          status: "spawned",
        }),
      );
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "status",
            status: "started",
            managed: false,
          }),
        ]),
      );
    } finally {
      Object.defineProperty(process, "platform", {
        configurable: true,
        value: originalPlatform,
      });
    }
  });

  it("can reveal a mapped external terminal by fallback title", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });

    try {
      vi.mocked(spawn).mockImplementation((commandName, args) => {
        const child = createChild();
        queueMicrotask(() => {
          if (commandName === "powershell.exe") {
            const script = Array.isArray(args) ? args.join(" ") : "";
            expect(script).toContain('$title = "Projecto: Example App');
            expect(script).toContain("ShowWindowAsync");
            expect(script).toContain("SetForegroundWindow");
            expect(script).toContain("$shell.AppActivate($title)");
            child.emit("close", 0);
          }
        });
        return child as never;
      });

      const runner = new CommandRunner("D:/tmp/projecto-runs");

      await expect(
        runner.revealExternalRun(
          "legacy-run",
          "Projecto: Example App (legacy)",
        ),
      ).resolves.toBe(true);
    } finally {
      Object.defineProperty(process, "platform", {
        configurable: true,
        value: originalPlatform,
      });
    }
  });

  it("closes a Projecto-owned visible Windows Terminal by run id", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });

    try {
      vi.mocked(spawn).mockImplementation((commandName) => {
        const child = createChild();
        queueMicrotask(() => {
          if (commandName === "powershell.exe") {
            child.emit("close", 0);
          }
        });
        return child as never;
      });
      const runner = new CommandRunner("D:/tmp/projecto-runs");
      const events: unknown[] = [];
      runner.onRunEvent((event) => events.push(event));

      const result = await runner.runCommand({
        projectId: "project-1",
        projectName: "Example App",
        projectPath: "D:/projects/example-app",
        command,
        terminalStrategy: "os-external",
      });

      await expect(runner.closeExternalRun(result.runId)).resolves.toBe(true);
      expect(spawn).toHaveBeenCalledWith(
        "powershell.exe",
        expect.arrayContaining(["-Command", expect.stringContaining(result.runId)]),
        expect.objectContaining({ windowsHide: true, stdio: "ignore" }),
      );
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            runId: result.runId,
            kind: "status",
            status: "stopped",
            message: "Projecto closed the mapped OS terminal.",
            managed: false,
          }),
        ]),
      );
    } finally {
      Object.defineProperty(process, "platform", {
        configurable: true,
        value: originalPlatform,
      });
    }
  });

  it("stops a persisted Windows Terminal process after Projecto restarts", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });

    try {
      const runsDirectory = path.join(
        os.tmpdir(),
        `projecto-command-runner-restart-test-${Date.now()}`,
      );
      const runId = "persisted-run";
      await fs.mkdir(runsDirectory, { recursive: true });
      await fs.writeFile(
        path.join(runsDirectory, `${runId}.process`),
        "6543|134000000000000000",
        "utf8",
      );
      vi.mocked(spawn).mockImplementation((commandName, args) => {
        const child = createChild();
        queueMicrotask(() => {
          if (commandName === "powershell.exe") {
            const script = Array.isArray(args) ? args.join(" ") : "";
            expect(script).toContain("$trackedProcessId = 6543");
            expect(script).toContain("$trackedProcessStartedAt = '134000000000000000'");
            child.emit("close", 0);
          }
        });
        return child as never;
      });
      const runner = new CommandRunner(runsDirectory);

      await expect(
        runner.closeExternalRun(runId, "Projecto: Example App (persisted)"),
      ).resolves.toBe(true);
      await expect(
        fs.access(path.join(runsDirectory, `${runId}.process`)),
      ).rejects.toThrow();
    } finally {
      Object.defineProperty(process, "platform", {
        configurable: true,
        value: originalPlatform,
      });
    }
  });
});