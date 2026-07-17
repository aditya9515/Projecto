import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CommandRunner } from "../commandRunner";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";

function createChild(): EventEmitter {
  return new EventEmitter();
}

describe("CommandRunner external terminal stop", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("stops a persisted Windows terminal wrapper after an app restart", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });

    const runsDirectory = path.join(
      os.tmpdir(),
      `projecto-external-stop-${Date.now()}`,
    );
    const runId = "persisted-run";

    try {
      await fs.mkdir(runsDirectory, { recursive: true });
      await fs.writeFile(
        path.join(runsDirectory, `${runId}.process`),
        "6543|134000000000000000",
      );
      vi.mocked(spawn).mockImplementation((command, args) => {
        const child = createChild();
        if (command === "powershell.exe") {
          expect(args).toEqual(
            expect.arrayContaining([
              "-Command",
              expect.stringContaining("$trackedProcessId = 6543"),
            ]),
          );
          queueMicrotask(() => child.emit("close", 0));
        }
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
      await fs.rm(runsDirectory, { recursive: true, force: true });
    }
  });
});
