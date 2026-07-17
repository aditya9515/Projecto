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
  stdout?: EventEmitter;
  stderr?: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
  unref: ReturnType<typeof vi.fn>;
  pid?: number;
};

function createManagedChild(pid = 4242): MockChild {
  const child = new EventEmitter() as MockChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
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

  it("starts OS internal commands as hidden managed background processes on Windows", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });

    try {
      vi.mocked(spawn).mockImplementation(() => createManagedChild() as never);
      const runner = new CommandRunner("D:/tmp/projecto-runs");
      const events: unknown[] = [];
      runner.onRunEvent((event) => events.push(event));

      const result = await runner.runCommand({
        projectId: "project-1",
        projectName: "Example App",
        projectPath: "D:/projects/example-app",
        command,
        terminalStrategy: "os-internal",
      });

      expect(spawn).toHaveBeenCalledWith(
        "npm run dev",
        expect.objectContaining({
          cwd: "D:/projects/example-app",
          shell: true,
          detached: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        }),
      );
      expect(spawn).not.toHaveBeenCalledWith(
        "wt.exe",
        expect.anything(),
        expect.anything(),
      );
      expect(result).toEqual(
        expect.objectContaining({
          commandId: "command-1",
          executionMode: "os-internal",
          managed: true,
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
          expect.objectContaining({
            kind: "status",
            status: "spawned",
            managed: true,
            message: expect.stringContaining("background"),
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

  it("streams managed stdout and stderr into run events and emits a final completed status", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "linux",
    });

    try {
      const child = createManagedChild();
      vi.mocked(spawn).mockReturnValue(child as never);
      const runner = new CommandRunner("D:/tmp/projecto-runs");
      const events: unknown[] = [];
      runner.onRunEvent((event) => events.push(event));

      const result = await runner.runCommand({
        projectId: "project-1",
        projectName: "Example App",
        projectPath: "/projects/example-app",
        command: {
          ...command,
          cwd: "/projects/example-app",
        },
        terminalStrategy: "os-internal",
      });

      child.stdout?.emit("data", Buffer.from("Local: http://localhost:5173\n"));
      child.stderr?.emit("data", Buffer.from("warning\n"));
      child.emit("close", 0, null);

      expect(spawn).toHaveBeenCalledWith(
        "npm run dev",
        expect.objectContaining({
          cwd: "/projects/example-app",
          shell: true,
          detached: true,
          windowsHide: true,
        }),
      );
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            runId: result.runId,
            kind: "stdout",
            message: "Local: http://localhost:5173\n",
            managed: true,
          }),
          expect.objectContaining({
            runId: result.runId,
            kind: "stderr",
            message: "warning\n",
            managed: true,
          }),
          expect.objectContaining({
            runId: result.runId,
            kind: "status",
            status: "completed",
            exitCode: 0,
            managed: true,
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

  it("stops Windows background process trees through taskkill", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });

    try {
      const child = createManagedChild(5555);
      vi.mocked(spawn)
        .mockReturnValueOnce(child as never)
        .mockReturnValue(createManagedChild(6666) as never);
      const runner = new CommandRunner("D:/tmp/projecto-runs");
      const events: unknown[] = [];
      runner.onRunEvent((event) => events.push(event));

      const result = await runner.runCommand({
        projectId: "project-1",
        projectName: "Example App",
        projectPath: "D:/projects/example-app",
        command,
        terminalStrategy: "os-internal",
      });

      expect(runner.stopRun(result.runId)).toBe(true);
      expect(spawn).toHaveBeenCalledWith(
        "taskkill.exe",
        ["/PID", "5555", "/T", "/F"],
        expect.objectContaining({
          windowsHide: true,
          stdio: "ignore",
        }),
      );

      child.emit("close", null, "SIGTERM");

      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            runId: result.runId,
            kind: "status",
            status: "stopped",
            exitCode: null,
            message: "Project stopped by Projecto.",
            managed: true,
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

  it("can still reveal a legacy external terminal by fallback title", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });

    try {
      vi.mocked(spawn).mockImplementation((commandName, args) => {
        const child = createManagedChild();
        queueMicrotask(() => {
          if (commandName === "powershell.exe") {
            const script = Array.isArray(args) ? args.join(" ") : "";
            expect(script).toContain(
              '$activated = $shell.AppActivate("Projecto: Example App',
            );
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

  it("closes a visible Windows terminal run by run id and emits stopped status", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });

    const runsDirectory = path.join(
      os.tmpdir(),
      `projecto-close-external-${Date.now()}`,
    );

    try {
      vi.mocked(spawn).mockImplementation((commandName, args) => {
        const child = createManagedChild();
        queueMicrotask(() => {
          if (commandName === "powershell.exe") {
            const script = Array.isArray(args) ? args.join(" ") : "";
            expect(script).toContain("taskkill.exe");
            expect(script).toContain("$runId = '");
            child.emit("close", 0);
          }
        });
        return child as never;
      });

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

      await expect(runner.closeExternalRun(result.runId)).resolves.toBe(true);
      expect(spawn).toHaveBeenCalledWith(
        "powershell.exe",
        expect.arrayContaining([
          "-Command",
          expect.stringContaining(result.runId),
        ]),
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
      await fs.rm(runsDirectory, { recursive: true, force: true });
    }
  });
  it("starts OS external commands in a visible terminal with mirrored output", async () => {
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
      vi.mocked(spawn).mockImplementation(() => createManagedChild() as never);
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
        expect.arrayContaining(["--title", expect.stringContaining("Projecto")]),
        expect.anything(),
      );
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
});
