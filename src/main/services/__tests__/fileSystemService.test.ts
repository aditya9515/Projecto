import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("write-file-atomic", () => ({
  default: vi.fn(),
}));

import writeFileAtomic from "write-file-atomic";

import { FileSystemService } from "../fileSystemService";

function createFileError(code: string): NodeJS.ErrnoException {
  const error = new Error(code) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

describe("FileSystemService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serializes concurrent atomic writes to the same target path", async () => {
    let activeWrites = 0;
    let maxActiveWrites = 0;
    vi.mocked(writeFileAtomic).mockImplementation(async () => {
      activeWrites += 1;
      maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeWrites -= 1;
    });

    const service = new FileSystemService();
    const targetPath = path.join(
      os.tmpdir(),
      `projecto-${crypto.randomUUID()}`,
      "settings.json",
    );

    await Promise.all([
      service.writeJsonAtomic(targetPath, { value: 1 }),
      service.writeJsonAtomic(targetPath, { value: 2 }),
    ]);

    expect(maxActiveWrites).toBe(1);
    expect(writeFileAtomic).toHaveBeenCalledTimes(2);
  });

  it("retries transient Windows file-lock failures", async () => {
    vi.mocked(writeFileAtomic)
      .mockRejectedValueOnce(createFileError("EPERM"))
      .mockResolvedValueOnce(undefined);

    const service = new FileSystemService();
    const targetPath = path.join(
      os.tmpdir(),
      `projecto-${crypto.randomUUID()}`,
      "project-details.json",
    );

    await service.writeJsonAtomic(targetPath, { ok: true });

    expect(writeFileAtomic).toHaveBeenCalledTimes(2);
  });

  it("cleans atomic temp files after final write failure", async () => {
    vi.mocked(writeFileAtomic).mockRejectedValue(createFileError("EACCES"));

    const service = new FileSystemService();
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "projecto-fs-"));
    const targetPath = path.join(directory, "project-details.json");
    const tempPath = path.join(directory, "project-details.json.451197617");
    await fs.writeFile(tempPath, "stale temp", "utf8");

    await expect(
      service.writeJsonAtomic(targetPath, { ok: true }),
    ).rejects.toThrow("EACCES");

    await expect(fs.access(tempPath)).rejects.toThrow();
  });
});
