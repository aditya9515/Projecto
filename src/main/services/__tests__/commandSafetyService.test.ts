import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { LaunchCommand, Project } from "../../types/shared";
import {
  CommandSafetyError,
  CommandSafetyService,
} from "../commandSafetyService";
import { FileSystemService } from "../fileSystemService";

describe("CommandSafetyService", () => {
  let tempDir: string;
  let service: CommandSafetyService;

  const project = {
    id: "project-1",
    name: "Workspace",
  } as Project;
  const command: LaunchCommand = {
    id: "command-1",
    label: "Dev",
    command: "npm run dev",
    cwd: "/tmp/workspace",
    runOnLaunch: true,
  };

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "projecto-command-safety-"));
    service = new CommandSafetyService(new FileSystemService(), tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true });
  });

  it("classifies common command risks", () => {
    expect(service.classifyCommand("npm run dev")).toBe("safe");
    expect(service.classifyCommand("npm install")).toBe("medium");
    expect(service.classifyCommand("rm -rf .")).toBe("dangerous");
  });

  it("requires first-run approval before running a command", async () => {
    await expect(
      service.ensureCommandsAllowed([{ project, command }]),
    ).rejects.toBeInstanceOf(CommandSafetyError);

    await expect(
      service.ensureCommandsAllowed([{ project, command }], {
        approvedCommandIds: [command.id],
      }),
    ).resolves.toBeUndefined();

    await expect(
      service.ensureCommandsAllowed([{ project, command }]),
    ).resolves.toBeUndefined();
  });

  it("requires an explicit override for dangerous commands", async () => {
    const dangerousCommand: LaunchCommand = {
      ...command,
      id: "command-dangerous",
      command: "rm -rf .",
    };

    await expect(
      service.ensureCommandsAllowed([{ project, command: dangerousCommand }], {
        approvedCommandIds: [dangerousCommand.id],
      }),
    ).rejects.toMatchObject({ code: "command_dangerous" });

    await expect(
      service.ensureCommandsAllowed([{ project, command: dangerousCommand }], {
        approvedCommandIds: [dangerousCommand.id],
        dangerousOverride: true,
      }),
    ).resolves.toBeUndefined();
  });
});
