import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import {
  CleanupCategorySummarySchema,
  CleanupPreviewSchema,
  CleanupReportSchema,
  CleanupStatusSchema,
  type CleanupCategory,
  type CleanupCategorySummary,
  type CleanupPreview,
  type CleanupReport,
  type CleanupStatus,
  type CleanupTrigger,
} from "../types/shared";
import { FileSystemService } from "./fileSystemService";

const DAY_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_RUN_ARTIFACT_LIMIT_BYTES = 250 * 1024 * 1024;
const ATOMIC_TEMP_RETENTION_MS = DAY_MS;
const STATE_SCHEMA_VERSION = 1;

const RUN_ARTIFACT_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(log|cmd|ps1|sh)$/i;
const RUN_PROCESS_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.process$/i;
const ATOMIC_TEMP_PATTERN =
  /^(activity|command-approvals|maintenance-state|project-details|projects|settings|subscription|project-terminal-sessions)\.json\.\d+$/;

const CATEGORY_DEFINITIONS: Record<
  CleanupCategory,
  Pick<CleanupCategorySummary, "label" | "description">
> = {
  "run-artifacts": {
    label: "Old run artifacts",
    description:
      "Mirrored logs and helper scripts older than the retention window, or beyond the 250 MB storage cap.",
  },
  "temporary-files": {
    label: "Stale temporary files",
    description:
      "Interrupted atomic-write leftovers older than 24 hours. Current data files and backups stay protected.",
  },
  "browser-cache": {
    label: "Desktop browser cache",
    description:
      "Electron HTTP and compiled-code caches. Cookies, sessions, local storage, and credentials are preserved.",
  },
  "legacy-data": {
    label: "Verified legacy metadata",
    description:
      "Old project metadata is eligible only after every record is confirmed in the current data store.",
  },
};

const PROTECTED_ITEMS = [
  "Imported project folders and source files",
  "Project details, settings, command approvals, and subscriptions",
  "Authentication cookies, tokens, and local browser storage",
  "Active terminal runs and their mapped process files",
  "Corrupt-data backups retained for recovery",
] as const;

const MaintenanceStateSchema = z.object({
  schemaVersion: z.literal(STATE_SCHEMA_VERSION),
  lastAutomaticVersion: z.string().min(1).optional(),
  lastReport: CleanupReportSchema.optional(),
});

type MaintenanceState = z.infer<typeof MaintenanceStateSchema>;

type CleanupCandidate = {
  category: Exclude<CleanupCategory, "browser-cache">;
  path: string;
  bytes: number;
};

type RunArtifactGroup = {
  runId: string;
  files: Array<{ path: string; bytes: number }>;
  bytes: number;
  latestModifiedAt: number;
};

type PreviewBundle = {
  preview: CleanupPreview;
  candidates: CleanupCandidate[];
};

export type MaintenanceServiceOptions = {
  userDataPath: string;
  appVersion: string;
  sessionDataPath?: string;
  legacyTempRunsPath?: string;
  retentionDays?: number;
  maxRunArtifactBytes?: number;
  now?: () => Date;
  clearCache?: () => Promise<void>;
  clearCodeCaches?: () => Promise<void>;
  fileSystemService?: FileSystemService;
};

function emptySummary(category: CleanupCategory): CleanupCategorySummary {
  return CleanupCategorySummarySchema.parse({
    category,
    ...CATEGORY_DEFINITIONS[category],
    fileCount: 0,
    estimatedBytes: 0,
  });
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function normalizeProjectPath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isInside(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  return (
    relative.length > 0 &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function getDirectoryStats(
  directoryPath: string,
): Promise<{ fileCount: number; bytes: number }> {
  let entries: Dirent<string>[];

  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) {
      return { fileCount: 0, bytes: 0 };
    }
    throw error;
  }

  let fileCount = 0;
  let bytes = 0;

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (!isInside(directoryPath, entryPath) || entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      const nested = await getDirectoryStats(entryPath);
      fileCount += nested.fileCount;
      bytes += nested.bytes;
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    try {
      const stats = await fs.stat(entryPath);
      fileCount += 1;
      bytes += stats.size;
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
    }
  }

  return { fileCount, bytes };
}

export class MaintenanceService {
  private readonly userDataPath: string;
  private readonly appVersion: string;
  private readonly sessionDataPath: string;
  private readonly legacyTempRunsPath: string;
  private readonly retentionDays: number;
  private readonly maxRunArtifactBytes: number;
  private readonly now: () => Date;
  private readonly clearCache?: () => Promise<void>;
  private readonly clearCodeCaches?: () => Promise<void>;
  private readonly fileSystemService: FileSystemService;
  private readonly statePath: string;
  private cleanupPromise: Promise<CleanupReport> | null = null;

  constructor(options: MaintenanceServiceOptions) {
    this.userDataPath = path.resolve(options.userDataPath);
    this.appVersion = options.appVersion;
    this.sessionDataPath = path.resolve(
      options.sessionDataPath ?? options.userDataPath,
    );
    this.legacyTempRunsPath = path.resolve(
      options.legacyTempRunsPath ?? path.join(os.tmpdir(), "projecto-runs"),
    );
    this.retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
    this.maxRunArtifactBytes =
      options.maxRunArtifactBytes ?? DEFAULT_RUN_ARTIFACT_LIMIT_BYTES;
    this.now = options.now ?? (() => new Date());
    this.clearCache = options.clearCache;
    this.clearCodeCaches = options.clearCodeCaches;
    this.fileSystemService =
      options.fileSystemService ?? new FileSystemService();
    this.statePath = path.join(this.userDataPath, "maintenance-state.json");
  }

  async getStatus(): Promise<CleanupStatus> {
    const [preview, state] = await Promise.all([
      this.preview(),
      this.readState(),
    ]);

    return CleanupStatusSchema.parse({
      preview,
      lastReport: state.lastReport,
    });
  }

  async preview(): Promise<CleanupPreview> {
    return (await this.buildPreview()).preview;
  }

  async runAutomaticCleanupIfNeeded(): Promise<CleanupReport | undefined> {
    const state = await this.readState();
    if (state.lastAutomaticVersion === this.appVersion) {
      return state.lastReport;
    }

    return this.runCleanup("automatic");
  }

  async runCleanup(trigger: CleanupTrigger): Promise<CleanupReport> {
    if (this.cleanupPromise) {
      return this.cleanupPromise;
    }

    this.cleanupPromise = this.executeCleanup(trigger).finally(() => {
      this.cleanupPromise = null;
    });
    return this.cleanupPromise;
  }

  private async executeCleanup(trigger: CleanupTrigger): Promise<CleanupReport> {
    const startedAt = this.now().toISOString();
    const bundle = await this.buildPreview();
    const results = new Map<CleanupCategory, CleanupCategorySummary>();
    const errors: string[] = [];

    for (const category of Object.keys(CATEGORY_DEFINITIONS) as CleanupCategory[]) {
      results.set(category, emptySummary(category));
    }

    for (const candidate of bundle.candidates) {
      try {
        await fs.rm(candidate.path, { force: true });
        const summary = results.get(candidate.category)!;
        summary.fileCount += 1;
        summary.estimatedBytes += candidate.bytes;
      } catch {
        errors.push(`Unable to remove one ${CATEGORY_DEFINITIONS[candidate.category].label.toLowerCase()} item.`);
      }
    }

    const cacheBefore = bundle.preview.categories.find(
      (entry) => entry.category === "browser-cache",
    );
    if (
      cacheBefore &&
      (cacheBefore.fileCount > 0 || cacheBefore.estimatedBytes > 0)
    ) {
      try {
        await this.clearCache?.();
        await this.clearCodeCaches?.();
        const cacheAfter = await this.getBrowserCacheStats();
        const summary = results.get("browser-cache")!;
        summary.fileCount = Math.max(
          0,
          cacheBefore.fileCount - cacheAfter.fileCount,
        );
        summary.estimatedBytes = Math.max(
          0,
          cacheBefore.estimatedBytes - cacheAfter.bytes,
        );
      } catch {
        errors.push("Unable to clear all desktop browser caches.");
      }
    }

    const completedAt = this.now().toISOString();
    const categories = [...results.values()];
    const report = CleanupReportSchema.parse({
      trigger,
      appVersion: this.appVersion,
      startedAt,
      completedAt,
      removedFiles: categories.reduce(
        (total, category) => total + category.fileCount,
        0,
      ),
      reclaimedBytes: categories.reduce(
        (total, category) => total + category.estimatedBytes,
        0,
      ),
      categories,
      errors,
    });

    const previousState = await this.readState();
    await this.fileSystemService.writeJsonAtomic(this.statePath, {
      schemaVersion: STATE_SCHEMA_VERSION,
      lastAutomaticVersion:
        trigger === "automatic"
          ? this.appVersion
          : previousState.lastAutomaticVersion,
      lastReport: report,
    } satisfies MaintenanceState);

    return report;
  }

  private async buildPreview(): Promise<PreviewBundle> {
    const summaries = new Map<CleanupCategory, CleanupCategorySummary>();
    const candidates: CleanupCandidate[] = [];

    for (const category of Object.keys(CATEGORY_DEFINITIONS) as CleanupCategory[]) {
      summaries.set(category, emptySummary(category));
    }

    const addCandidate = (candidate: CleanupCandidate): void => {
      candidates.push(candidate);
      const summary = summaries.get(candidate.category)!;
      summary.fileCount += 1;
      summary.estimatedBytes += candidate.bytes;
    };

    const runDirectories = [
      path.join(this.userDataPath, "runs"),
      this.legacyTempRunsPath,
    ].filter(
      (value, index, values) =>
        values.findIndex((candidate) => candidate === value) === index,
    );

    for (const directory of runDirectories) {
      for (const candidate of await this.getRunArtifactCandidates(directory)) {
        addCandidate(candidate);
      }
    }

    for (const candidate of await this.getAtomicTempCandidates()) {
      addCandidate(candidate);
    }

    const legacyCandidate = await this.getLegacyProjectCandidate();
    if (legacyCandidate) {
      addCandidate(legacyCandidate);
    }

    const browserCache = await this.getBrowserCacheStats();
    const browserSummary = summaries.get("browser-cache")!;
    browserSummary.fileCount = browserCache.fileCount;
    browserSummary.estimatedBytes = browserCache.bytes;

    const categories = [...summaries.values()];
    return {
      candidates,
      preview: CleanupPreviewSchema.parse({
        generatedAt: this.now().toISOString(),
        retentionDays: this.retentionDays,
        totalFiles: categories.reduce(
          (total, category) => total + category.fileCount,
          0,
        ),
        estimatedBytes: categories.reduce(
          (total, category) => total + category.estimatedBytes,
          0,
        ),
        categories,
        protectedItems: PROTECTED_ITEMS,
      }),
    };
  }

  private async getRunArtifactCandidates(
    directoryPath: string,
  ): Promise<CleanupCandidate[]> {
    let entries: Dirent<string>[];

    try {
      entries = await fs.readdir(directoryPath, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) {
        return [];
      }
      throw error;
    }

    const activeRunIds = new Set(
      entries.flatMap((entry) => {
        if (!entry.isFile() || entry.isSymbolicLink()) {
          return [];
        }
        const match = RUN_PROCESS_PATTERN.exec(entry.name);
        return match?.[1] ? [match[1].toLowerCase()] : [];
      }),
    );
    const groups = new Map<string, RunArtifactGroup>();

    for (const entry of entries) {
      if (!entry.isFile() || entry.isSymbolicLink()) {
        continue;
      }

      const match = RUN_ARTIFACT_PATTERN.exec(entry.name);
      const runId = match?.[1]?.toLowerCase();
      if (!runId || activeRunIds.has(runId)) {
        continue;
      }

      const entryPath = path.join(directoryPath, entry.name);
      if (!isInside(directoryPath, entryPath)) {
        continue;
      }

      try {
        const stats = await fs.stat(entryPath);
        const group = groups.get(runId) ?? {
          runId,
          files: [],
          bytes: 0,
          latestModifiedAt: 0,
        };
        group.files.push({ path: entryPath, bytes: stats.size });
        group.bytes += stats.size;
        group.latestModifiedAt = Math.max(
          group.latestModifiedAt,
          stats.mtimeMs,
        );
        groups.set(runId, group);
      } catch (error) {
        if (!isMissing(error)) {
          throw error;
        }
      }
    }

    const orderedGroups = [...groups.values()].sort(
      (left, right) => left.latestModifiedAt - right.latestModifiedAt,
    );
    const cutoff = this.now().getTime() - this.retentionDays * DAY_MS;
    const selectedRunIds = new Set(
      orderedGroups
        .filter((group) => group.latestModifiedAt < cutoff)
        .map((group) => group.runId),
    );
    let retainedBytes = orderedGroups
      .filter((group) => !selectedRunIds.has(group.runId))
      .reduce((total, group) => total + group.bytes, 0);

    for (const group of orderedGroups) {
      if (
        retainedBytes <= this.maxRunArtifactBytes ||
        selectedRunIds.has(group.runId)
      ) {
        continue;
      }
      selectedRunIds.add(group.runId);
      retainedBytes -= group.bytes;
    }

    return orderedGroups
      .filter((group) => selectedRunIds.has(group.runId))
      .flatMap((group) =>
        group.files.map((file) => ({
          category: "run-artifacts" as const,
          path: file.path,
          bytes: file.bytes,
        })),
      );
  }

  private async getAtomicTempCandidates(): Promise<CleanupCandidate[]> {
    let entries: Dirent<string>[];

    try {
      entries = await fs.readdir(this.userDataPath, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) {
        return [];
      }
      throw error;
    }

    const cutoff = this.now().getTime() - ATOMIC_TEMP_RETENTION_MS;
    const candidates: CleanupCandidate[] = [];

    for (const entry of entries) {
      if (
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        !ATOMIC_TEMP_PATTERN.test(entry.name)
      ) {
        continue;
      }

      const entryPath = path.join(this.userDataPath, entry.name);
      if (!isInside(this.userDataPath, entryPath)) {
        continue;
      }

      try {
        const stats = await fs.stat(entryPath);
        if (stats.mtimeMs < cutoff) {
          candidates.push({
            category: "temporary-files",
            path: entryPath,
            bytes: stats.size,
          });
        }
      } catch (error) {
        if (!isMissing(error)) {
          throw error;
        }
      }
    }

    return candidates;
  }

  private async getLegacyProjectCandidate(): Promise<CleanupCandidate | null> {
    const legacyPath = path.join(this.userDataPath, "projects.json");
    const detailsPath = path.join(this.userDataPath, "project-details.json");

    try {
      const [legacyRaw, detailsRaw, stats] = await Promise.all([
        fs.readFile(legacyPath, "utf8"),
        fs.readFile(detailsPath, "utf8"),
        fs.stat(legacyPath),
      ]);
      if (stats.mtimeMs >= this.now().getTime() - this.retentionDays * DAY_MS) {
        return null;
      }

      const legacy = JSON.parse(legacyRaw) as unknown;
      const details = JSON.parse(detailsRaw) as unknown;
      if (!Array.isArray(legacy) || !Array.isArray(details)) {
        return null;
      }

      const detailRecords = details.flatMap((value) => {
        if (!value || typeof value !== "object") {
          return [];
        }
        const record = value as Record<string, unknown>;
        return typeof record.id === "string" && typeof record.path === "string"
          ? [{ id: record.id, path: normalizeProjectPath(record.path) }]
          : [];
      });
      const legacyRecords = legacy.flatMap((value) => {
        if (!value || typeof value !== "object") {
          return [];
        }
        const record = value as Record<string, unknown>;
        return typeof record.id === "string" && typeof record.path === "string"
          ? [{ id: record.id, path: normalizeProjectPath(record.path) }]
          : [];
      });
      const migrationVerified =
        legacyRecords.length === legacy.length &&
        detailRecords.length === details.length &&
        legacyRecords.every((legacyRecord) =>
          detailRecords.some(
            (detailRecord) =>
              detailRecord.id === legacyRecord.id ||
              detailRecord.path === legacyRecord.path,
          ),
        );

      if (!migrationVerified || !isInside(this.userDataPath, legacyPath)) {
        return null;
      }

      return {
        category: "legacy-data",
        path: legacyPath,
        bytes: stats.size,
      };
    } catch (error) {
      if (isMissing(error) || error instanceof SyntaxError) {
        return null;
      }
      throw error;
    }
  }

  private async getBrowserCacheStats(): Promise<{
    fileCount: number;
    bytes: number;
  }> {
    const cacheDirectories = [
      path.join(this.sessionDataPath, "Cache"),
      path.join(this.sessionDataPath, "Code Cache"),
    ];
    const totals = { fileCount: 0, bytes: 0 };

    for (const directory of cacheDirectories) {
      const stats = await getDirectoryStats(directory);
      totals.fileCount += stats.fileCount;
      totals.bytes += stats.bytes;
    }

    return totals;
  }

  private async readState(): Promise<MaintenanceState> {
    try {
      const raw = await this.fileSystemService.readJsonFile<unknown>(
        this.statePath,
      );
      const parsed = MaintenanceStateSchema.safeParse(raw);
      if (parsed.success) {
        return parsed.data;
      }
    } catch (error) {
      if (!isMissing(error) && !(error instanceof SyntaxError)) {
        throw error;
      }
    }

    return { schemaVersion: STATE_SCHEMA_VERSION };
  }
}
