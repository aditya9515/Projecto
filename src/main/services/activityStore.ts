import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  ActivityItemSchema,
  type ActivityKind,
  type DetectedType,
  type Project,
  type UsageStats,
  UsageStatsSchema,
} from "../types/shared";
import { FileSystemService } from "./fileSystemService";

const MAX_ACTIVITY_ITEMS = 60;

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function getFavoriteStack(projects: Project[]): DetectedType | undefined {
  const counts = new Map<DetectedType, number>();

  for (const project of projects) {
    const current = counts.get(project.detectedType) ?? 0;
    counts.set(project.detectedType, current + project.launchCount);
  }

  const favorite = [...counts.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0];
  return favorite?.[0];
}

export class ActivityStore {
  private readonly filePath: string;

  constructor(
    private readonly fileSystemService: FileSystemService,
    userDataPath: string,
    private readonly shouldRecordActivity?: () => Promise<boolean>,
  ) {
    this.filePath = path.join(userDataPath, "activity.json");
  }

  async recordActivity(input: {
    kind: ActivityKind;
    title: string;
    description?: string;
    projectId?: string;
  }): Promise<void> {
    if (this.shouldRecordActivity && !(await this.shouldRecordActivity())) {
      return;
    }

    const activity = await this.loadActivity({ repair: true });
    activity.unshift(
      ActivityItemSchema.parse({
        id: randomUUID(),
        kind: input.kind,
        title: input.title,
        description: input.description,
        projectId: input.projectId,
        occurredAt: new Date().toISOString(),
      }),
    );
    await this.persist(activity.slice(0, MAX_ACTIVITY_ITEMS));
  }

  async getUsageStats(projects: Project[]): Promise<UsageStats> {
    const activity = await this.loadActivity({ repair: false });
    const today = new Date();
    const launchesToday = activity.filter((item) => {
      if (item.kind !== "launch-profile" && item.kind !== "run-command") {
        return false;
      }

      return isSameLocalDay(new Date(item.occurredAt), today);
    }).length;

    const mostUsedProject = [...projects].sort(
      (left, right) => right.launchCount - left.launchCount,
    )[0];

    return UsageStatsSchema.parse({
      launchesToday,
      mostUsedProjectId: mostUsedProject?.id,
      favoriteStack: getFavoriteStack(projects),
      recentActivity: activity.slice(0, 8),
    });
  }

  private async loadActivity(options?: { repair?: boolean }) {
    const shouldRepair = options?.repair ?? true;

    try {
      const raw = await this.fileSystemService.readJsonFile<unknown>(
        this.filePath,
      );
      return await this.repairActivity(raw, { repair: shouldRepair });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;

      if (code === "ENOENT") {
        if (shouldRepair) {
          await this.persist([]);
        }
        return [];
      }

      if (error instanceof SyntaxError) {
        if (shouldRepair) {
          await this.backupCorruptFile();
          await this.persist([]);
        }
        return [];
      }

      throw error;
    }
  }

  private async repairActivity(raw: unknown, options?: { repair?: boolean }) {
    const shouldRepair = options?.repair ?? true;
    const parsed = ActivityItemSchema.array().safeParse(raw);

    if (parsed.success) {
      return parsed.data;
    }

    if (!Array.isArray(raw)) {
      if (shouldRepair) {
        await this.backupCorruptFile();
        await this.persist([]);
      }
      return [];
    }

    const repaired = raw.flatMap((item) => {
      const result = ActivityItemSchema.safeParse(item);
      return result.success ? [result.data] : [];
    });

    if (shouldRepair) {
      await this.persist(repaired);
    }
    return repaired;
  }

  private async persist(activity: unknown[]): Promise<void> {
    await this.fileSystemService.writeJsonAtomic(this.filePath, activity);
  }

  private async backupCorruptFile(): Promise<void> {
    if (!(await this.fileSystemService.exists(this.filePath))) {
      return;
    }

    const backupPath = `${this.filePath}.${Date.now()}.corrupt`;
    await this.fileSystemService.moveFile(this.filePath, backupPath);
  }
}
