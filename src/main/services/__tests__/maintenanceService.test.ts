import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { MaintenanceService } from "../maintenanceService";

const NOW = new Date("2026-08-10T12:00:00.000Z");
const OLD_DATE = new Date("2026-06-01T12:00:00.000Z");
const FRESH_DATE = new Date("2026-08-09T12:00:00.000Z");
const OLD_RUN_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVE_RUN_ID = "22222222-2222-4222-8222-222222222222";
const FRESH_RUN_ID = "33333333-3333-4333-8333-333333333333";

const tempDirectories: string[] = [];

async function createDirectory(name: string): Promise<string> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), `projecto-maintenance-${name}-`),
  );
  tempDirectories.push(directory);
  return directory;
}

async function writeFile(
  filePath: string,
  content: string,
  modifiedAt = FRESH_DATE,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  await fs.utimes(filePath, modifiedAt, modifiedAt);
}

function createService(options: {
  userDataPath: string;
  sessionDataPath?: string;
  legacyTempRunsPath?: string;
  maxRunArtifactBytes?: number;
  clearCache?: () => Promise<void>;
  clearCodeCaches?: () => Promise<void>;
}): MaintenanceService {
  return new MaintenanceService({
    ...options,
    appVersion: "1.0.7",
    now: () => NOW,
  });
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      fs.rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("MaintenanceService", () => {
  it("previews only allowlisted stale artifacts and protects active data", async () => {
    const userDataPath = await createDirectory("preview-user");
    const sessionDataPath = await createDirectory("preview-session");
    const legacyTempRunsPath = await createDirectory("preview-legacy-runs");
    const runsPath = path.join(userDataPath, "runs");

    await writeFile(path.join(runsPath, `${OLD_RUN_ID}.log`), "old log", OLD_DATE);
    await writeFile(path.join(runsPath, `${OLD_RUN_ID}.ps1`), "old script", OLD_DATE);
    await writeFile(path.join(runsPath, `${ACTIVE_RUN_ID}.log`), "active log", OLD_DATE);
    await writeFile(path.join(runsPath, `${ACTIVE_RUN_ID}.process`), "42|123", OLD_DATE);
    await writeFile(path.join(runsPath, `${FRESH_RUN_ID}.log`), "fresh log");
    await writeFile(path.join(userDataPath, "settings.json.123"), "temporary", OLD_DATE);
    await writeFile(path.join(userDataPath, "settings.json"), "protected", OLD_DATE);
    await writeFile(path.join(userDataPath, "settings.json.456.corrupt"), "backup", OLD_DATE);
    await writeFile(path.join(sessionDataPath, "Cache", "data.bin"), "cache");
    await writeFile(path.join(sessionDataPath, "Code Cache", "code.bin"), "code");

    const preview = await createService({
      userDataPath,
      sessionDataPath,
      legacyTempRunsPath,
    }).preview();

    expect(preview.totalFiles).toBe(5);
    expect(preview.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "run-artifacts", fileCount: 2 }),
        expect.objectContaining({ category: "temporary-files", fileCount: 1 }),
        expect.objectContaining({ category: "browser-cache", fileCount: 2 }),
        expect.objectContaining({ category: "legacy-data", fileCount: 0 }),
      ]),
    );
    expect(preview.protectedItems.join(" ")).toContain("project folders");
  });

  it("cleans eligible files, browser caches, and records a report", async () => {
    const userDataPath = await createDirectory("cleanup-user");
    const sessionDataPath = await createDirectory("cleanup-session");
    const legacyTempRunsPath = await createDirectory("cleanup-legacy-runs");
    const runsPath = path.join(userDataPath, "runs");
    const oldLogPath = path.join(runsPath, `${OLD_RUN_ID}.log`);
    const activeLogPath = path.join(runsPath, `${ACTIVE_RUN_ID}.log`);
    const settingsPath = path.join(userDataPath, "settings.json");
    const tempPath = path.join(userDataPath, "settings.json.123");
    const cachePath = path.join(sessionDataPath, "Cache");
    const codeCachePath = path.join(sessionDataPath, "Code Cache");

    await writeFile(oldLogPath, "old log", OLD_DATE);
    await writeFile(activeLogPath, "active log", OLD_DATE);
    await writeFile(path.join(runsPath, `${ACTIVE_RUN_ID}.process`), "42|123", OLD_DATE);
    await writeFile(settingsPath, "protected", OLD_DATE);
    await writeFile(tempPath, "temporary", OLD_DATE);
    await writeFile(path.join(cachePath, "data.bin"), "cache data");
    await writeFile(path.join(codeCachePath, "code.bin"), "code cache");

    const service = createService({
      userDataPath,
      sessionDataPath,
      legacyTempRunsPath,
      clearCache: () => fs.rm(cachePath, { force: true, recursive: true }),
      clearCodeCaches: () =>
        fs.rm(codeCachePath, { force: true, recursive: true }),
    });
    const report = await service.runCleanup("manual");

    await expect(fs.access(oldLogPath)).rejects.toThrow();
    await expect(fs.access(tempPath)).rejects.toThrow();
    await expect(fs.access(activeLogPath)).resolves.toBeUndefined();
    await expect(fs.access(settingsPath)).resolves.toBeUndefined();
    expect(report.removedFiles).toBe(4);
    expect(report.reclaimedBytes).toBeGreaterThan(0);
    expect(report.errors).toEqual([]);

    const status = await service.getStatus();
    expect(status.lastReport).toEqual(report);
    expect(status.preview.totalFiles).toBe(0);
  });

  it("runs automatic cleanup only once for each app version", async () => {
    const userDataPath = await createDirectory("automatic-user");
    const sessionDataPath = await createDirectory("automatic-session");
    const legacyTempRunsPath = await createDirectory("automatic-legacy-runs");
    const cachePath = path.join(sessionDataPath, "Cache");
    let clearCount = 0;

    await writeFile(path.join(cachePath, "data.bin"), "cache data");
    const service = createService({
      userDataPath,
      sessionDataPath,
      legacyTempRunsPath,
      clearCache: async () => {
        clearCount += 1;
        await fs.rm(cachePath, { force: true, recursive: true });
      },
    });

    const first = await service.runAutomaticCleanupIfNeeded();
    const second = await service.runAutomaticCleanupIfNeeded();

    expect(first?.trigger).toBe("automatic");
    expect(second).toEqual(first);
    expect(clearCount).toBe(1);
  });

  it("removes legacy metadata only after migration is fully verified", async () => {
    const verifiedUserDataPath = await createDirectory("legacy-verified");
    const unverifiedUserDataPath = await createDirectory("legacy-unverified");
    const record = { id: "project-1", path: "C:\\work\\project-1" };

    await writeFile(
      path.join(verifiedUserDataPath, "projects.json"),
      JSON.stringify([record]),
      OLD_DATE,
    );
    await writeFile(
      path.join(verifiedUserDataPath, "project-details.json"),
      JSON.stringify([record]),
      OLD_DATE,
    );
    await writeFile(
      path.join(unverifiedUserDataPath, "projects.json"),
      JSON.stringify([record]),
      OLD_DATE,
    );
    await writeFile(
      path.join(unverifiedUserDataPath, "project-details.json"),
      JSON.stringify([{ id: "project-2", path: "C:\\work\\project-2" }]),
      OLD_DATE,
    );

    const verifiedService = createService({
      userDataPath: verifiedUserDataPath,
      legacyTempRunsPath: await createDirectory("verified-temp-runs"),
    });
    const unverifiedService = createService({
      userDataPath: unverifiedUserDataPath,
      legacyTempRunsPath: await createDirectory("unverified-temp-runs"),
    });

    expect(
      (await verifiedService.preview()).categories.find(
        (entry) => entry.category === "legacy-data",
      )?.fileCount,
    ).toBe(1);
    expect(
      (await unverifiedService.preview()).categories.find(
        (entry) => entry.category === "legacy-data",
      )?.fileCount,
    ).toBe(0);

    await verifiedService.runCleanup("manual");
    await expect(
      fs.access(path.join(verifiedUserDataPath, "projects.json")),
    ).rejects.toThrow();
    await expect(
      fs.access(path.join(unverifiedUserDataPath, "projects.json")),
    ).resolves.toBeUndefined();
  });

  it("enforces the run-artifact size cap without touching active runs", async () => {
    const userDataPath = await createDirectory("size-cap-user");
    const runsPath = path.join(userDataPath, "runs");

    await writeFile(
      path.join(runsPath, `${OLD_RUN_ID}.log`),
      "12345678",
      new Date("2026-08-08T12:00:00.000Z"),
    );
    await writeFile(
      path.join(runsPath, `${FRESH_RUN_ID}.log`),
      "abcdefgh",
      FRESH_DATE,
    );
    await writeFile(
      path.join(runsPath, `${ACTIVE_RUN_ID}.log`),
      "protected active data",
      OLD_DATE,
    );
    await writeFile(
      path.join(runsPath, `${ACTIVE_RUN_ID}.process`),
      "42|123",
      OLD_DATE,
    );

    const preview = await createService({
      userDataPath,
      legacyTempRunsPath: await createDirectory("size-cap-temp-runs"),
      maxRunArtifactBytes: 10,
    }).preview();
    const runArtifacts = preview.categories.find(
      (entry) => entry.category === "run-artifacts",
    );

    expect(runArtifacts?.fileCount).toBe(1);
    expect(runArtifacts?.estimatedBytes).toBe(8);
  });
});
